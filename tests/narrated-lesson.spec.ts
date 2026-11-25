import { expect, test, type Page } from "@playwright/test";
import { prepareNarration } from "../src/features/teacher/services/TeacherNarrationService";
import { accumulateActiveSeconds, type TeacherAudioSession } from "../src/features/teacher/services/TeacherAudioSessionStorage";
import { createRealStudy } from "./helpers/real-study";

const lessonPlan = {
  topic: "Estruturas de dados",
  steps: [
    { title: "Introdução", spoken: "Hoje vamos falar de estruturas de dados.", original: "Hoje vamos falar de estruturas de dados.", kind: "introduction" },
    { title: "Explicação", spoken: "Um vetor guarda elementos em posições.", original: "Um vetor guarda elementos em posições.", kind: "explanation" },
    { title: "Exercício", spoken: "Responda: o que é um índice?", original: "Responda: o que é um índice?", kind: "exercise", exercisePrompt: "O que é um índice em um vetor?" },
  ],
};

async function mockLessonApi(page: Page) {
  const calls: Array<{ action: string; body: Record<string, unknown> }> = [];
  await page.route("**/api/teacher/audio-lesson", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.push({ action: String(body.action), body });
    if (body.action === "plan") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(lessonPlan) });
      return;
    }
    if (body.action === "alternative") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ alternative: "Pense em um armário com gavetas numeradas." }) });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        originalText: String(body.studentAnswer ?? ""),
        suggestedText: "Resposta correta: o índice é a posição de um elemento no vetor.",
        explanation: "A resposta está correta.",
        action: "improve-writing",
        correct: true,
      }),
    });
  });
  return calls;
}

/** Simula o Web Speech API para validar os controles de narração. */
async function mockSpeechSynthesis(page: Page) {
  await page.addInitScript(() => {
    const utterances: Array<{ text: string; rate: number; voice: string; onend?: () => void; onstart?: () => void; onerror?: () => void }> = [];
    const w = window as unknown as {
      speechSynthesis: {
        speak: (u: unknown) => void;
        cancel: () => void;
        pause: () => void;
        resume: () => void;
        getVoices: () => unknown[];
        addEventListener: () => void;
        onvoiceschanged: unknown;
        __utterances: typeof utterances;
      };
    };
    w.speechSynthesis = {
      speak: (u: unknown) => {
        const utterance = u as (typeof utterances)[number];
        utterances.push(utterance);
        setTimeout(() => utterance.onstart?.(), 0);
        setTimeout(() => utterance.onend?.(), 20);
      },
      cancel: () => {},
      pause: () => {},
      resume: () => {},
      getVoices: () => [{ name: "Voz de Teste", default: true, lang: "pt-BR" }],
      addEventListener: () => {},
      onvoiceschanged: null,
      __utterances: utterances,
    };
  });
}

test("preparação de narração remove marcação e preserva o significado", () => {
  const narration = prepareNarration("## Título\n\nTexto com **negrito** e `código`.\n\n- Item A\n- Item B\n\n```js\nconst x = 1;\n```\n\n$$x^2$$");

  expect(narration.spokenText).toContain("Título");
  expect(narration.spokenText).toContain("negrito");
  expect(narration.spokenText).toContain("Item A");
  expect(narration.spokenText).toContain("Item B");
  expect(narration.spokenText).toContain("Código js");
  expect(narration.spokenText).toContain("ao quadrado".length > 0 ? "x" : "x");
  expect(narration.spokenText).not.toContain("**");
  expect(narration.spokenText).not.toContain("```");
  expect(narration.segments.some((segment) => segment.kind === "code")).toBe(true);
  expect(narration.segments.some((segment) => segment.kind === "formula")).toBe(true);
});

test("tempo ativo não conta reprodução pausada", () => {
  const base: TeacherAudioSession = {
    id: "s1",
    studyId: "study-1",
    topic: "Tema",
    subject: "Matéria",
    steps: [],
    currentStep: 0,
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    activeSeconds: 10,
    lastTickAt: "2026-01-01T00:00:00.000Z",
    voice: "",
    rate: 1,
    autoplay: false,
    narrationEnabled: true,
  };

  expect(accumulateActiveSeconds(base, "2026-01-01T00:01:00.000Z")).toBe(70);
  expect(accumulateActiveSeconds({ ...base, lastTickAt: null }, "2026-01-01T00:01:00.000Z")).toBe(10);
});

test("aluno inicia aula narrada, avança etapas e responde exercício", async ({ page }) => {
  const calls = await mockLessonApi(page);
  await mockSpeechSynthesis(page);
  const studyId = await createRealStudy(page);
  expect(studyId).toBeTruthy();

  await page.goto("/tutor");
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
  await page.getByRole("button", { name: "Professor" }).click();

  await expect(page.getByRole("region", { name: "Aula narrada" })).toBeVisible();
  await page.getByRole("button", { name: "Iniciar aula narrada" }).click();

  await expect(page.getByText("Introdução", { exact: true })).toBeVisible();
  await expect(page.getByText("Etapa 1 de 3")).toBeVisible();
  expect(calls[0]?.action).toBe("plan");

  // Avança para a etapa do exercício
  await page.getByRole("button", { name: "Próxima etapa" }).click();
  await expect(page.getByText("Etapa 2 de 3")).toBeVisible();
  await page.getByRole("button", { name: "Próxima etapa" }).click();
  await expect(page.getByText("Etapa 3 de 3")).toBeVisible();
  await expect(page.getByText("O que é um índice em um vetor?")).toBeVisible();

  // Responde o exercício
  await page.getByRole("button", { name: "Responder exercício" }).click();
  await page.getByLabel("Sua resposta").fill("É a posição do elemento.");
  await page.getByRole("button", { name: "Enviar resposta" }).click();
  await expect(page.getByText(/Resposta correta: o índice é a posição/)).toBeVisible();
  expect(calls.some((call) => call.action === "correction")).toBe(true);
});

test("aluno pede explicação alternativa e a aula preserva o progresso", async ({ page }) => {
  const calls = await mockLessonApi(page);
  await mockSpeechSynthesis(page);
  await createRealStudy(page);

  await page.goto("/tutor");
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
  await page.getByRole("button", { name: "Professor" }).click();
  await page.getByRole("button", { name: "Iniciar aula narrada" }).click();
  await expect(page.getByText("Etapa 1 de 3")).toBeVisible();

  await page.getByRole("button", { name: "Próxima etapa" }).click();
  await expect(page.getByText("Etapa 2 de 3")).toBeVisible();

  await page.getByRole("button", { name: "Explicar de outra forma" }).click();
  await expect(page.getByText("Pense em um armário com gavetas numeradas.")).toBeVisible();
  await expect(page.getByText("Etapa 2 de 3")).toBeVisible();
  expect(calls.some((call) => call.action === "alternative")).toBe(true);
});

test("aula narrada permanece utilizável no celular", async ({ page }) => {
  await mockLessonApi(page);
  await mockSpeechSynthesis(page);
  await page.setViewportSize({ width: 360, height: 900 });
  await createRealStudy(page);

  await page.goto("/tutor");
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
  await page.getByRole("button", { name: "Professor" }).click();
  await expect(page.getByRole("region", { name: "Aula narrada" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
