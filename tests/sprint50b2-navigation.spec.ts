import { expect, test } from "@playwright/test";
import { createRealStudy, importTextMaterial } from "./helpers/real-study";
import { readIndexedDBStore } from "./helpers/indexed-db";

test("retorno contextual da biblioteca e acesso direto seguro", async ({ page }) => {
  const id = await createRealStudy(page);
  await page.goto("/biblioteca");
  await page.getByRole("article", { name: "fundamentos.txt" }).getByRole("link", { name: "Abrir", exact: true }).click();
  await expect(page.getByRole("link", { name: "Voltar à Biblioteca" })).toHaveAttribute("href", "/biblioteca");
  const studyNav = page.getByLabel("Navegação dos estudos");
  await expect(studyNav.locator(`a[href*="tema=${encodeURIComponent(id)}"]`).first()).toHaveAttribute("href", /origem=biblioteca/);
  await page.goto(`/estudo?tema=${encodeURIComponent(id)}`);
  await expect(page.getByRole("link", { name: "Voltar ao Dashboard" })).toHaveAttribute("href", "/");
});

test("Tutor mobile não reserva área vazia de histórico", async ({ page }) => {
  await page.setViewportSize({width: 360, height: 780});
  await page.goto("/tutor");
  const sidebar = page.getByLabel("Conversas do Tutor IA");
  await expect(sidebar.getByRole("button", { name: "Nova conversa" })).toBeVisible();
  await expect(sidebar.getByText("Nenhuma conversa encontrada.")).toBeHidden();
  const box = await sidebar.boundingBox();
  expect(box?.height).toBeLessThan(155);
  await sidebar.getByRole("button", { name: "Nova conversa" }).focus();
  await page.keyboard.press("Enter");
  await expect(sidebar.getByRole("list", {name:"Histórico de conversas"}).getByRole("listitem")).toHaveCount(1);
});


test("Semana de Prova preserva origem ao trocar entre dois materiais e retorna à prova", async ({ page }) => {
  const studyId = await createRealStudy(page);
  await importTextMaterial(page, "segundo.txt", "Outro material sintético de algoritmos.");
  await page.goto("/organizar");
  await page.getByRole("button", { name: "Ações para segundo.txt" }).click();
  await page.getByRole("menuitem", { name: "Mover" }).click();
  await page.getByRole("textbox", { name: "Curso", exact: true }).fill("Ciência da Computação");
  await page.getByRole("textbox", { name: "Semestre", exact: true }).fill("1º semestre");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Algoritmos");
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Estruturas de dados");
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText("Alterações salvas automaticamente");
  await page.getByRole("dialog").getByRole("button", { name: "Fechar" }).first().click();
  const materials = await readIndexedDBStore<{ id: string; name: string; studyId?: string }>(page, "documents");
  const first = materials.find((item) => item.name === "fundamentos.txt");
  const second = materials.find((item) => item.name === "segundo.txt");
  expect(first?.studyId).toBe(studyId);
  expect(second?.studyId).toBe(studyId);
  expect(first?.id).not.toBe(second?.id);
  await page.evaluate((id) => localStorage.setItem("studyai:exams:offline-session", JSON.stringify([{
    id: "exam-50b2", studyId: id, title: "Prova sintética", discipline: "Algoritmos", examDate: "2027-12-01",
    subjects: [{ id: "subject-1", name: "Estruturas", priority: "high", completed: false }],
    materialIds: [], dailyMinutes: 60, createdAt: "2026-11-08T12:00:00.000Z", updatedAt: "2026-11-08T12:00:00.000Z"
  }])), studyId);
  await page.goto("/provas");
  await expect(page.getByRole("heading", { name: "Atividades desta prova" })).toBeVisible();
  const tutorAction = page.locator('a[href*="aba=ia"][href*="origem=provas"][href*="prova=exam-50b2"]');
  await tutorAction.click();
  await expect(page.getByRole("link", { name: "Voltar à Semana de Prova" })).toHaveAttribute("href", "/provas?prova=exam-50b2");
  const navigation = page.getByLabel("Navegação dos estudos");
  for (const material of [first!, second!]) {
    const link = navigation.getByRole("link", { name: material.name, exact: true });
    await expect(link).toHaveAttribute("href", /origem=provas&prova=exam-50b2/);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`arquivo=${encodeURIComponent(material.id)}.*origem=provas.*prova=exam-50b2`));
    await expect(page.getByRole("link", { name: "Voltar à Semana de Prova" })).toHaveAttribute("href", "/provas?prova=exam-50b2");
  }
  await page.getByRole("link", { name: "Voltar à Semana de Prova" }).click();
  await expect(page).toHaveURL(/\/provas\?prova=exam-50b2/);
  await expect(page.getByRole("heading", { name: "Prova sintética" })).toBeVisible();
});
