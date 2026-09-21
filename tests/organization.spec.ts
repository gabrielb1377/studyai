import { expect, test } from "@playwright/test";

import { importTextMaterial } from "./helpers/real-study";
import { readIndexedDBStore } from "./helpers/indexed-db";

test("organização atualiza o material real e cria o estudo", async ({ page }) => {
  await importTextMaterial(page, "aula-inicial.txt", "Conteúdo real da aula importada.");
  await page.goto("/organizar");

  await expect(page.getByText("aula-inicial.txt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ações para aula-inicial.txt" }).click();
  await page.getByRole("menuitem", { name: "Renomear" }).click();
  await page.getByLabel("Novo nome do arquivo").fill("aula-organizada.txt");
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText("Alterações salvas automaticamente");
  await page.getByRole("dialog").getByRole("button", { name: "Fechar" }).first().click();

  await page.getByRole("button", { name: "Ações para aula-organizada.txt" }).click();
  await page.getByRole("menuitem", { name: "Mover" }).click();
  await page.getByRole("textbox", { name: "Curso", exact: true }).fill("Ciência da Computação");
  await page.getByRole("textbox", { name: "Semestre", exact: true }).fill("1º semestre");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Algoritmos");
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Introdução");
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText("Alterações salvas automaticamente");
  await page.getByRole("dialog").getByRole("button", { name: "Fechar" }).first().click();
  await page.getByRole("button", { name: "Finalizar organização" }).click();

  await expect(page).toHaveURL(/\/biblioteca$/);
  const card = page.getByRole("article", { name: "aula-organizada.txt" });
  await expect(card).toContainText("Algoritmos");
  await expect(card).toContainText("Introdução");

  const state = {
    materials: await readIndexedDBStore<Array<{ studyId: string }>[number]>(page, "documents"),
    studies: await readIndexedDBStore<Array<{ studyId: string }>[number]>(page, "studies"),
    contents: await readIndexedDBStore<Array<{ studyId: string }>[number]>(page, "contents"),
  };
  expect(state.studies).toHaveLength(1);
  expect(state.materials[0].studyId).toBe(state.studies[0].studyId);
  expect(state.contents[0].studyId).toBe(state.studies[0].studyId);
});

test("organização permanece responsiva no celular sem dados previamente cadastrados", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/organizar");
  await expect(page.getByRole("button", { name: "Finalizar organização" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
