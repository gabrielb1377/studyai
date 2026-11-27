import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { daysUntilExam, formatExamDate } from "../src/features/exam/ExamService";
import { examLearningHref, examReturnHref } from "../src/features/exam/ExamLearningNavigation";
import { createRealStudy } from "./helpers/real-study";

test("datas locais e rotas de retorno preservam dia e contexto", () => {
  expect(formatExamDate("2026-12-01")).toBe("01/12/2026");
  expect(daysUntilExam("2026-12-01", new Date(2026, 10, 30, 23, 59))).toBe(1);
  expect(daysUntilExam("data-inválida", new Date(2026, 10, 30))).toBeNull();
  expect(examReturnHref("exam/seguro")).toBe("/provas?prova=exam%2Fseguro");
  expect(examLearningHref("study/seguro", "tutor", "exam/seguro"))
    .toBe("/estudo?tema=study%2Fseguro&aba=ia&origem=provas&prova=exam%2Fseguro");
  expect(examLearningHref("study-1", "exam", "exam-1"))
    .toBe("/estudo?tema=study-1&aba=quiz&modo=exam&origem=provas&prova=exam-1");
});

test("fluxo completo cria, edita, vincula, navega, retorna e persiste", async ({ page }) => {
  const studyId = await createRealStudy(page);
  await page.goto("/provas");

  await page.getByRole("button", { name: "Nova Prova" }).click();
  await expect(page.getByLabel("Disciplina / Matéria")).toBeFocused();
  await page.getByLabel("Disciplina / Matéria").fill("Algoritmos");
  await page.getByLabel("Nome da Prova").fill("P1 Estruturas");
  await page.getByLabel("Data da Prova").fill("2026-12-01");
  await page.getByLabel("Meta Diária (minutos)").fill("45");
  await page.getByLabel("Assuntos / Conteúdos da Prova").fill("Vetores");
  await page.getByLabel("Prioridade do assunto").selectOption("high");
  await page.getByLabel("Assuntos / Conteúdos da Prova").press("Enter");
  await page.getByRole("button", { name: "Salvar Prova" }).click();

  await expect(page.getByRole("heading", { name: "P1 Estruturas" })).toBeVisible();
  await expect(page.getByText(/Data: 01\/12\/2026/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plano Automático de Revisão" })).toBeVisible();

  await page.getByLabel("Vincular Estudo").selectOption(studyId);
  await expect(page.getByRole("button", { name: "Remover material fundamentos.txt" })).toBeVisible();
  await page.getByRole("button", { name: "Remover material fundamentos.txt" }).click();
  await expect(page.getByText("Nenhum material vinculado.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Adicionar material fundamentos.txt" }).click();
  await expect(page.getByRole("button", { name: "Remover material fundamentos.txt" })).toBeVisible();

  await page.getByRole("button", { name: "Editar prova" }).click();
  await page.getByLabel("Nome da Prova").fill("P1 Estruturas — revisada");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("heading", { name: "P1 Estruturas — revisada" })).toBeVisible();

  const examId = await page.evaluate(() => JSON.parse(localStorage.getItem("studyai:exams:offline-session") ?? "[]")[0]?.id as string);
  const tutorHref = examLearningHref(studyId, "tutor", examId);
  await Promise.all([
    page.waitForURL(new RegExp(`tema=${studyId}.*origem=provas.*prova=${examId}`)),
    page.locator(`a[href="${tutorHref}"]`).click(),
  ]);
  await expect(page.getByRole("link", { name: "Voltar à Semana de Prova" })).toHaveAttribute("href", examReturnHref(examId));
  await Promise.all([
    page.waitForURL(new RegExp(`/provas\\?prova=${examId}$`)),
    page.getByRole("link", { name: "Voltar à Semana de Prova" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "P1 Estruturas — revisada" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "P1 Estruturas — revisada" })).toBeVisible();
  await expect(page.getByLabel("Vincular Estudo")).toHaveValue(studyId);
  await expect(page.getByRole("button", { name: "Remover material fundamentos.txt" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("estudo inválido não concede acesso e mantém retorno seguro", async ({ page }) => {
  await page.goto("/estudo?tema=study-inexistente&aba=quiz&origem=provas&prova=exam-inexistente");
  await expect(page.getByRole("heading", { name: "Estudo indisponível" })).toBeVisible();
  await expect(page.getByText("O endereço informado não concede acesso", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Voltar à Semana de Prova" })).toHaveAttribute("href", "/provas?prova=exam-inexistente");
  await expect(page.getByRole("heading", { name: "Simulado & Quiz Explicado" })).toHaveCount(0);
});

test("falha de progresso possui estado explícito sem expor erro interno", () => {
  const hook = readFileSync(path.join(process.cwd(), "src/features/exam/useExamProgress.ts"), "utf8");
  const workspace = readFileSync(path.join(process.cwd(), "src/features/exam/ExamWorkspace.tsx"), "utf8");
  expect(hook).toContain("Os registros de progresso não puderam ser carregados agora. Nenhum dado foi alterado.");
  expect(hook).not.toContain("error.stack");
  expect(workspace).toContain("progressError");
});
