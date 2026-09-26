import { expect, test } from "@playwright/test";
import { TeacherPromptBuilder } from "../src/features/teacher/TeacherPromptBuilder";
import type { TeacherRequest } from "../src/features/teacher/types";
import { createRealStudy } from "./helpers/real-study";

const baseRequest: TeacherRequest = {
  mode: "teacher",
  action: "guided_lesson",
  level: "advanced",
  method: "socratic",
  summaryStyle: "medium",
};

test("instruções do Professor cobrem aula, diagramas, exercícios e correção sem acessar arquivos", () => {
  const guided = TeacherPromptBuilder.instruction(baseRequest);
  const flowchart = TeacherPromptBuilder.instruction({ ...baseRequest, action: "flowchart" });
  const mindMap = TeacherPromptBuilder.instruction({ ...baseRequest, action: "mind_map" });
  const exercise = TeacherPromptBuilder.instruction({ ...baseRequest, action: "exercise" });

  expect(guided).toContain("uma etapa por vez");
  expect(guided).toContain("resposta correta, justificativa, conceito relacionado, fonte utilizada e recomendação de revisão");
  expect(flowchart).toContain("Mermaid `flowchart TD`");
  expect(mindMap).toContain("Mermaid `mindmap`");
  expect(exercise).toContain("múltipla escolha");
  expect(guided).toContain("Não afirme que leu arquivos físicos");
});

test("modo Professor envia nível, método, contexto recuperado e trecho selecionado", async ({ page }) => {
  const requests: Array<{
    context?: { studyId: string };
    chunks?: Array<{ studyId: string }>;
    teaching?: TeacherRequest;
  }> = [];
  await page.route("**/api/tutor", async (route) => {
    const body = route.request().postDataJSON() as (typeof requests)[number];
    requests.push(body);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ model: "test-model", text: `Resposta do Professor: ${body.teaching?.action}` }),
    });
  });

  const studyId = await createRealStudy(page);
  await page.goto("/tutor");
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
  await page.getByRole("button", { name: "Professor" }).click();
  await expect(page.getByRole("complementary", { name: "Controles do Professor" })).toBeVisible();
  await page.getByLabel("Nível da explicação").selectOption("advanced");
  await page.getByLabel("Método de ensino").selectOption("analogies");
  await page.locator("summary").filter({ hasText: "Ferramentas de aula" }).click();
  await page.getByRole("button", { name: "Plano de aula" }).click();
  await expect(page.getByText("Resposta do Professor: lesson_plan", { exact: true })).toBeVisible();

  expect(requests[0].context?.studyId).toBe(studyId);
  expect(requests[0].chunks?.every((chunk) => chunk.studyId === studyId)).toBe(true);
  expect(requests[0].teaching).toMatchObject({
    mode: "teacher",
    action: "lesson_plan",
    level: "advanced",
    method: "analogies",
  });

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("studyai:material-selection", {
      detail: {
        text: "Vetores armazenam elementos em posições identificadas por índices.",
        sourceName: "Aula de Vetores.pdf",
        page: 3,
        chapter: "Vetores",
      },
    }));
  });
  await expect(page.getByText("Trecho selecionado", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Explicar este trecho" }).click();
  await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Resposta do Professor: explain_selection", { exact: true })).toBeVisible();
  expect(requests[1].teaching?.selection).toMatchObject({
    sourceName: "Aula de Vetores.pdf",
    page: 3,
    chapter: "Vetores",
  });
});

test("modo Professor permanece utilizável no celular", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  const studyId = await createRealStudy(page);
  await page.goto(`/estudo?tema=${studyId}`);
  await page.getByRole("tab", { name: "IA", exact: true }).click();
  await page.getByRole("button", { name: "Professor" }).click();
  await expect(page.getByRole("button", { name: "Ensine-me este tema" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
