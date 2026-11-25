import { expect, test, type Page } from "@playwright/test";
import { createEmptyLearningProfile } from "../src/features/learning/LearningStorage";
import { PlanningEngine } from "../src/features/planning/PlanningEngine";
import {
  clampDailyMinutes,
  clampHorizonDays,
  clampItemMinutes,
  sanitizeStudyPlan,
} from "../src/features/planning/PlanningValidation";
import { STORAGE_DATABASE_VERSION } from "../src/lib/storage/StorageVersion";
import type { Exam } from "../src/types/exam";
import type { Flashcard } from "../src/types/flashcard";
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
    progress: 35,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
    ...overrides,
  };
}

function futureExamDate(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test.describe("Sprint 53A — Planejamento Inteligente (Motor & Validação)", () => {
  test("valida e limita metas, tempos diários, horizonte e itens malformados", () => {
    expect(clampDailyMinutes(5)).toBe(15);
    expect(clampDailyMinutes(999)).toBe(360);
    expect(clampDailyMinutes("invalid", 45)).toBe(45);
    expect(clampHorizonDays(0)).toBe(1);
    expect(clampHorizonDays(99)).toBe(30);
    expect(clampItemMinutes(2)).toBe(10);
    expect(clampItemMinutes(500)).toBe(180);

    expect(sanitizeStudyPlan(null)).toBeNull();
    expect(sanitizeStudyPlan({ version: 2, id: "x" })).toBeNull();

    const sanitized = sanitizeStudyPlan({
      version: 1,
      id: "plan-1",
      title: "   Plano   Foco   ",
      dailyMinutes: 1000,
      horizonDays: 99,
      items: [
        {
          id: "a:review:general",
          dayOffset: 50,
          dateStr: "invalid",
          studyTitle: "Álgebra",
          subject: "Matemática",
          kind: "review",
          title: "Revisar Álgebra",
          reason: "Atrasado",
          priority: "high",
          priorityScore: 150,
          estimatedMinutes: 5,
          completed: true,
          targetHref: "/estudo?tema=a",
        },
        {
          id: "a:review:general",
          dayOffset: 0,
          studyTitle: "Duplicado",
          subject: "Matemática",
          kind: "review",
          title: "Duplicado",
          priority: "low",
          estimatedMinutes: 20,
          completed: false,
          targetHref: "/estudo?tema=a",
        },
        {
          id: "bad-kind",
          kind: "not-a-kind",
          title: "Inválido",
        },
      ],
    });

    expect(sanitized).not.toBeNull();
    expect(sanitized!.title).toBe("Plano Foco");
    expect(sanitized!.dailyMinutes).toBe(360);
    expect(sanitized!.horizonDays).toBe(30);
    expect(sanitized!.items).toHaveLength(1);
    expect(sanitized!.items[0].estimatedMinutes).toBe(10);
    expect(sanitized!.items[0].priorityScore).toBe(100);
    expect(sanitized!.items[0].dayOffset).toBe(29);
  });

  test("prioriza provas próximas, revisões atrasadas e preserva conclusão sem duplicar ao recalcular", () => {
    const now = new Date("2026-11-14T12:00:00.000Z");
    const studyA = makeStudy({ studyId: "study-a", title: "Cálculo I", subject: "Matemática", progress: 25 });
    const studyB = makeStudy({ studyId: "study-b", title: "História", subject: "Humanas", progress: 90 });

    const profile = createEmptyLearningProfile(now.toISOString());
    profile.topics["study-a"] = {
      studyId: "study-a",
      subject: "Matemática",
      topic: "Cálculo I",
      timeMinutes: 40,
      flashcardsAnswered: 5,
      quizzesCompleted: 2,
      correctAnswers: 3,
      wrongAnswers: 7,
      accessDates: ["2026-11-01"],
      lastAccessedAt: "2026-11-01T10:00:00.000Z",
      difficulty: "advanced",
    };

    const dueCard: Flashcard = {
      id: "fc-1",
      studyId: "study-a",
      question: "Qual a derivada de x²?",
      answer: "2x",
      difficulty: "medium",
      createdAt: "2026-11-01T10:00:00.000Z",
      updatedAt: "2026-11-01T10:00:00.000Z",
      correctAnswers: 1,
      wrongAnswers: 2,
      nextReviewAt: "2026-11-10T10:00:00.000Z",
      reviewIntervalDays: 1,
      easeFactor: 2.5,
      repetitions: 1,
      reviewAlgorithm: "sm2",
    };

    const exam: Exam = {
      id: "exam-calc",
      studyId: "study-a",
      title: "P1 Cálculo",
      discipline: "Matemática",
      examDate: "2026-11-16",
      subjects: [
        { id: "s1", name: "Limites", priority: "high", completed: false },
        { id: "s2", name: "Derivadas", priority: "high", completed: false },
      ],
      materialIds: [],
      dailyMinutes: 60,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const initial = PlanningEngine.generate(
      { dailyMinutes: 60, horizonDays: 5, includeExams: true, goal: "Passar na P1" },
      {
        studies: [studyA, studyB],
        profile,
        flashcards: [dueCard],
        quizzes: [],
        topicReviews: [
          {
            discipline: "Matemática",
            studyId: "study-a",
            topic: "Derivadas",
            attempts: 3,
            correct: 1,
            wrong: 2,
            streak: 0,
            result: "wrong",
            difficulty: "hard",
            lastReviewAt: "2026-11-05T10:00:00.000Z",
            nextReviewAt: "2026-11-06T10:00:00.000Z",
          },
        ],
        exams: [exam],
        now,
      },
    );

    expect(initial.items.length).toBeGreaterThanOrEqual(4);
    const examItem = initial.items.find((item) => item.examId === "exam-calc");
    const reviewItem = initial.items.find((item) => item.kind === "review" && item.studyId === "study-a");
    const flashcardItem = initial.items.find((item) => item.kind === "flashcards" && item.studyId === "study-a");
    const studyBItem = initial.items.find((item) => item.studyId === "study-b");

    expect(examItem).toBeDefined();
    expect(reviewItem).toBeDefined();
    expect(flashcardItem).toBeDefined();
    expect(studyBItem).toBeDefined();
    expect(examItem!.priority).toBe("high");
    expect(examItem!.dayOffset).toBeLessThanOrEqual(2);
    expect(examItem!.priorityScore).toBeGreaterThan(studyBItem!.priorityScore);

    const uniqueIds = new Set(initial.items.map((item) => item.id));
    expect(uniqueIds.size).toBe(initial.items.length);

    const firstId = examItem!.id;
    const withCompleted = {
      ...initial,
      items: initial.items.map((item) =>
        item.id === firstId ? { ...item, completed: true, completedAt: "2026-11-14T13:00:00.000Z" } : item,
      ),
    };

    const recalculated = PlanningEngine.generate(
      { dailyMinutes: 90, horizonDays: 5, includeExams: true },
      {
        studies: [studyA, studyB],
        profile,
        flashcards: [dueCard],
        quizzes: [],
        topicReviews: [],
        exams: [exam],
        now,
      },
      withCompleted,
    );

    const persistedFirst = recalculated.items.find((item) => item.id === firstId);
    expect(persistedFirst?.completed).toBe(true);
    expect(persistedFirst?.completedAt).toBe("2026-11-14T13:00:00.000Z");
    expect(new Set(recalculated.items.map((item) => item.id)).size).toBe(recalculated.items.length);

    const reconciled = PlanningEngine.reconcileWithCurrentSources(recalculated, [studyB], []);
    const missingItem = reconciled.items.find((item) => item.studyId === "study-a");
    expect(missingItem?.sourceUnavailable).toBe(true);
  });
});

test.describe("Sprint 53A — Planejamento Inteligente (E2E no Navegador)", () => {
  test("fluxo completo: estado vazio, geração com dados reais + prova, edição, persistência após reload e recálculo sem duplicar", async ({ page }) => {
    await page.goto("/planejamento");
    await expect(page.getByRole("heading", { name: "Plano de Estudos" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Adicione seus primeiros conteúdos para começar")).toBeVisible();

    const studyId = await createRealStudy(
      page,
      "Estruturas de dados fundamentais: vetores, listas ligadas e árvores binárias.",
    );

    const nowIso = new Date().toISOString();
    await putIndexedDBRecord(page, "metadata", {
      key: "topic-reviews-v1",
      updatedAt: nowIso,
      value: [
        {
          discipline: "Algoritmos",
          studyId,
          topic: "Vetores",
          attempts: 2,
          correct: 0,
          wrong: 2,
          streak: 0,
          result: "wrong",
          difficulty: "hard",
          lastReviewAt: "2026-01-01T10:00:00.000Z",
          nextReviewAt: "2026-01-02T10:00:00.000Z",
        },
      ],
    });

    await page.goto("/provas");
    await page.getByRole("button", { name: "Nova Prova", exact: true }).click();
    await page.getByLabel("Disciplina da Biblioteca").selectOption({
      label: "Algoritmos · Ciência da Computação · 1º semestre",
    });
    await page.getByLabel("Nome da Prova").fill("Prova P1 Algoritmos");
    await page.getByLabel("Data da Prova").fill(futureExamDate(3));
    await page.getByLabel("Assuntos / Conteúdos da Prova").fill("Árvores Binárias");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await page.getByRole("button", { name: "Salvar Prova", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Prova P1 Algoritmos" })).toBeVisible();

    await page.getByRole("link", { name: "Planejar no cronograma" }).click();
    await expect(page).toHaveURL(/\/planejamento\?prova=/);

    await page.getByLabel("Nome do plano").fill("Reta Final Algoritmos");
    await page.getByLabel("Meta principal").fill("Dominar Árvores e Vetores até a P1");
    await page.getByRole("button", { name: "90m" }).click();
    await page.getByRole("button", { name: "Gerar plano inteligente" }).click();

    await expect(page.getByRole("heading", { name: "Reta Final Algoritmos" })).toBeVisible();
    await expect(page.getByText("Meta: Dominar Árvores e Vetores até a P1")).toBeVisible();
    await expect(page.getByText("90 min/dia")).toBeVisible();

    const examCardTitle = "Preparar Estruturas de dados para Prova P1 Algoritmos";
    await expect(page.getByText(examCardTitle)).toBeVisible();
    await expect(page.getByText("Revisão espaçada · Estruturas de dados")).toBeVisible();

    const toggleButton = page.getByRole("button", {
      name: `Marcar "${examCardTitle}" como concluída`,
    });
    await toggleButton.click();
    await expect(
      page.getByRole("button", { name: `Desmarcar "${examCardTitle}" como concluída` }),
    ).toHaveAttribute("aria-pressed", "true");

    await expect(page.getByLabel(`Duração de ${examCardTitle}`, { exact: true })).toHaveText("25 min");
    await page.getByLabel(`Aumentar duração de ${examCardTitle}`).click();
    await expect(page.getByLabel(`Duração de ${examCardTitle}`, { exact: true })).toHaveText("30 min");

    await page.getByLabel(`Prioridade de Revisão espaçada · Estruturas de dados`).selectOption("low");
    await page.getByRole("button", { name: `Mover Revisão espaçada · Estruturas de dados para baixo` }).click();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Reta Final Algoritmos" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Desmarcar "${examCardTitle}" como concluída` }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel(`Duração de ${examCardTitle}`, { exact: true })).toHaveText("30 min");
    await expect(page.getByLabel("Prioridade de Revisão espaçada · Estruturas de dados")).toHaveValue("low");
    const orderedArticles = page.locator('section[aria-label="Cronograma diário de estudos"] article');
    await expect(orderedArticles.first()).toContainText(examCardTitle);

    const studiesBeforeRecalc = await readIndexedDBStore<StudyRecord>(page, "studies");
    const linkedStudyBefore = studiesBeforeRecalc.find((entry) => entry.studyId === studyId);
    expect(linkedStudyBefore?.progress).toBe(0);

    const countBeforeRecalc = await page.locator('section[aria-label="Cronograma diário de estudos"] article').count();
    await page.getByRole("button", { name: "Recalcular prioridades" }).click();
    await expect(page.getByText("Plano atualizado com prioridades reais.")).toBeVisible();
    const countAfterRecalc = await page.locator('section[aria-label="Cronograma diário de estudos"] article').count();
    expect(countAfterRecalc).toBe(countBeforeRecalc);
    await expect(
      page.getByRole("button", { name: `Desmarcar "${examCardTitle}" como concluída` }),
    ).toHaveAttribute("aria-pressed", "true");

    const openLink = page
      .locator("article", { hasText: "Revisão espaçada · Estruturas de dados" })
      .getByRole("link", { name: "Abrir" });
    await openLink.click();
    await expect(page).toHaveURL(new RegExp(`/estudo\\?tema=${encodeURIComponent(studyId)}`));

    await page.goto("/");
    await expect(page.getByRole("link", { name: "Abrir planejamento" })).toBeVisible();
  });

  test("lida de forma recuperável com estudo removido sem perder o plano", async ({ page }) => {
    const studyId = await createRealStudy(page, "Tema temporário para validar remoção.");

    await page.goto("/planejamento");
    await page.getByRole("button", { name: "Gerar plano inteligente" }).click();
    await expect(page.getByText("Avançar estudo · Estruturas de dados")).toBeVisible();

    await deleteIndexedDBRecord(page, "studies", studyId);
    await page.reload();

    await expect(page.getByText("Estudo indisponível")).toBeVisible();
    await expect(
      page.getByText(/apontam para um estudo ou prova que não está mais disponível/i),
    ).toBeVisible();
  });

  test("mantém isolamento entre contas e layout responsivo mobile sem overflow", async ({ page }) => {
    const emailA = `plan-alpha-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
    const emailB = `plan-beta-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
    const password = "StudyAI2026secure";

    await page.goto("/conta");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await page.getByLabel("Nome").fill("Conta Alpha");
    await page.getByLabel("Email").fill(emailA);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible({ timeout: 15_000 });

    await createRealStudy(page, "Conteúdo exclusivo da conta Alpha.");

    await page.goto("/planejamento");
    await page.getByLabel("Nome do plano").fill("Plano Privado Alpha");
    await page.getByRole("button", { name: "Gerar plano inteligente" }).click();
    await expect(page.getByRole("heading", { name: "Plano Privado Alpha" })).toBeVisible();

    await page.goto("/conta");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Conta StudyAI" })).toBeVisible();

    await page.getByRole("button", { name: "Criar conta" }).click();
    await page.getByLabel("Nome").fill("Conta Beta");
    await page.getByLabel("Email").fill(emailB);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible({ timeout: 15_000 });

    await page.goto("/planejamento");
    await expect(page.getByRole("heading", { name: "Plano Privado Alpha" })).toHaveCount(0);
    await expect(page.getByText("Adicione seus primeiros conteúdos para começar")).toBeVisible();

    await page.goto("/conta");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Conta StudyAI" })).toBeVisible();
    await page.getByLabel("Email").fill(emailA);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Conta e sincronização" })).toBeVisible({ timeout: 15_000 });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/planejamento");
    await expect(page.getByRole("heading", { name: "Plano Privado Alpha" })).toBeVisible();
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasOverflow).toBe(false);
  });
});
