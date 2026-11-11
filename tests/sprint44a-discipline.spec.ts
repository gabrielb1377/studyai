import { expect, test } from "@playwright/test";
import { importTextMaterial } from "./helpers/real-study";
import type { RetrievedChunk } from "../src/features/retrieval/RetrievalTypes";

test.use({ actionTimeout: 15_000 });

test("Biblioteca e Tutor recuperam materiais selecionados e retomam a disciplina no mobile", async ({ page }) => {
  test.setTimeout(150_000);
  const requests: Array<{ chunks?: RetrievedChunk[]; context: { subject: string } }> = [];
  await page.route("**/api/tutor", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { text: "A bisseção divide o intervalo.", provider: "gemini", model: "mock" } });
  });
  const fixtures = [
    ["Unidade 2.txt", "Modelagem", "A bisseção divide o intervalo e mantém um zero de função."],
    ["Exercícios.txt", "Modelagem", "Pratique bisseção no intervalo de dois a quatro."],
    ["Simulado.txt", "Modelagem", "Questão: aplique bisseção ao intervalo de um a dois."],
    ["Outra disciplina.txt", "Física", "O termo bisseção também aparece nesta outra disciplina."],
  ];
  for (const [file, subject, body] of fixtures) {
    await importTextMaterial(page, file, body);
    await page.goto("/organizar");
    await page.getByRole("button", { name: `Ações para ${file}` }).click();
    await page.getByRole("menuitem", { name: "Mover" }).click();
    for (const [label, value] of [["Curso", "Engenharia"], ["Semestre", "1"], ["Matéria", subject], ["Tema", "Bisseção"]]) {
      await page.getByRole("textbox", { name: label, exact: true }).fill(value);
    }
    await expect(page.getByRole("dialog").getByRole("status")).toHaveText("Alterações salvas automaticamente");
    await page.getByRole("dialog").getByRole("button", { name: "Fechar" }).first().click();
  }
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/biblioteca");
  await page.getByRole("link", { name: "Estudar matéria completa" }).click();
  await page.locator("#materia-completa summary").click();
  await page.getByRole("combobox", { name: "Disciplina", exact: true }).selectOption({ label: "Modelagem · Engenharia · 1" });
  await page.getByRole("button", { name: "Selecionar todos" }).click();
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(3);
  await page.getByRole("checkbox", { name: "Simulado · Simulado.txt" }).uncheck();
  await page.getByRole("button", { name: "Confirmar seleção e abrir conversa" }).click();
  expect(requests).toHaveLength(0);
  await page.getByLabel("Mensagem para o Tutor IA").fill("Explique bisseção no intervalo");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" })
    .getByText("A bisseção divide o intervalo.", { exact: true })).toBeVisible();
  expect(requests[0].context.subject).toBe("Modelagem");
  const chunks = requests[0].chunks ?? [];
  expect(chunks.map((chunk) => chunk.metadata.sourceName).sort()).toEqual(["Exercícios.txt", "Unidade 2.txt"]);
  expect(chunks.every((chunk) => chunk.metadata.pageStart === undefined)).toBe(true);
  await page.reload();
  await expect(page.getByText("Fontes recuperadas (2)")).toBeVisible();
  await expect(page.getByText("Estudar matéria completa · Modelagem")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
