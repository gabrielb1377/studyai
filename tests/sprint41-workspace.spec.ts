import { expect, test, type Page } from "@playwright/test";
import { createRealStudy } from "./helpers/real-study";

const SESSION = {
  user: { id: "user-secure-exam", email: "prova@example.com", emailVerified: true },
  csrfToken: "csrf-token",
  sessionId: "session-1",
  devices: [],
  database: "postgres" as const,
};

const attemptQuestions = Array.from({ length: 5 }, (_, index) => ({
  id: `secure-${index + 1}`,
  question: `Questão protegida ${index + 1}`,
  alternatives: ["Opção A", "Opção B", "Opção C", "Opção D"],
}));

const attempt = {
  attemptId: "attempt-1",
  status: "created",
  title: "Prova protegida",
  questions: attemptQuestions,
  totalCount: 5,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const graded = {
  attemptId: attempt.attemptId,
  status: "completed",
  score: 80,
  correctCount: 4,
  totalCount: 5,
  answers: [1, 1, 1, 1, 0],
  questions: attemptQuestions.map((question) => ({ ...question, correctAnswer: 1, explanation: "Explicação liberada" })),
  completedAt: "2026-01-01T00:05:00.000Z",
};

async function authenticate(page: Page) {
  await page.route("**/auth/session", (route) => route.fulfill({ json: SESSION }));
  await page.route("**/auth/refresh", (route) => route.fulfill({ json: SESSION }));
  await page.goto("/");
  await page.waitForFunction((userId) => localStorage.getItem("studyai:active-session-owner") === userId, SESSION.user.id);
}

for (const width of [1280, 390]) {
  test(`modo prova protegido retoma respostas e só revela o gabarito após a entrega (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await authenticate(page);

    await page.route("**/api/exam/attempt**", async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        const body = request.postDataJSON() as { questions?: unknown; chunks: unknown[] };
        expect(body.questions).toBeUndefined();
        expect(body.chunks.length).toBeGreaterThan(0);
      }
      return route.fulfill({ json: attempt });
    });
    await page.route("**/api/exam/grade", (route) => route.fulfill({ json: graded }));

    const studyId = await createRealStudy(page);
    await page.goto(`/estudo?tema=${studyId}&aba=quiz`);
    const quiz = page.getByRole("region", { name: "Simulado & Quiz Explicado" });
    await quiz.getByLabel("Modo do simulado").selectOption("exam");
    await expect(quiz.getByText("Simulado protegido")).toBeVisible();
    await quiz.getByRole("button", { name: "Gerar prova protegida" }).click();
    await expect(quiz.getByText("Questão protegida 1")).toBeVisible();
    await expect(quiz.getByText("Explicação liberada")).toHaveCount(0);

    const firstAnswer = quiz.getByRole("button", { name: /B\. Opção B/ });
    await firstAnswer.click();
    await expect(firstAnswer).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(quiz.getByText("Questão protegida 1")).toBeVisible();
    await expect(quiz.getByRole("button", { name: /B\. Opção B/ })).toHaveAttribute("aria-pressed", "true");

    await quiz.getByRole("button", { name: "Ir para questão 5" }).click();
    await quiz.getByRole("button", { name: /B\. Opção B/ }).click();
    await quiz.getByRole("button", { name: "Entregar Prova" }).click();
    await expect(quiz.getByText("Prova corrigida")).toBeVisible();
    await expect(quiz.getByText("80.00%", { exact: true })).toBeVisible();
    await expect(quiz.getByText("Explicação liberada").first()).toBeVisible();
  });
}

test("modo prática continua local e revela a explicação após responder", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("**/api/tutor/quiz", (route) => route.fulfill({ json: {
    questions: Array.from({ length: 5 }, (_, index) => ({
      question: `Pergunta local ${index + 1}`,
      alternatives: ["Opção A", "Opção B", "Opção C", "Opção D"],
      correctAnswer: 0,
      explanation: "Explicação local",
      difficulty: "easy",
    })),
  } }));

  const studyId = await createRealStudy(page);
  await page.goto(`/estudo?tema=${studyId}&aba=quiz`);
  const quiz = page.getByRole("region", { name: "Simulado & Quiz Explicado" });
  await quiz.getByRole("button", { name: "Gerar primeiro simulado" }).click();
  await expect(quiz.getByText("Pergunta local 1")).toBeVisible();
  await expect(quiz.getByText("Explicação local")).toHaveCount(0);
  await quiz.getByRole("button", { name: /A\. Opção A/ }).click();
  await expect(quiz.getByText("Explicação local").first()).toBeVisible();
});

test("ferramentas continuam abrindo após seis painéis", async ({ page }) => {
  const studyId = await createRealStudy(page);
  await page.goto(`/estudo?tema=${studyId}`);
  for (const name of ["Material", "IA", "Mentor", "Flashcards", "Quiz", "Notas", "Revisão", "IA Quality", "Lab", "Resumos"]) {
    const tab = page.getByRole("tab", { name, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    const panelName = ({ IA: "Tutor IA", Revisão: "Revisão de extração", "IA Quality": "AI Quality Lab", Lab: "Laboratório" } as Record<string, string>)[name] ?? name;
    await expect(page.getByRole("tabpanel", { name: panelName, exact: true })).toBeVisible();
  }
});
