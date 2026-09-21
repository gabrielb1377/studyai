import { expect, test } from "@playwright/test";

import { importTextMaterial } from "./helpers/real-study";

test("biblioteca inicia vazia e recebe um material importado pelo usuário", async ({ page }) => {
  await page.goto("/biblioteca");
  await expect(page.getByRole("heading", { name: "Você ainda não possui materiais." })).toBeVisible();

  await importTextMaterial(page, "anotacoes-reais.txt", "Conteúdo produzido para a importação do usuário.");
  await page.goto("/biblioteca");

  const card = page.getByRole("article", { name: "anotacoes-reais.txt" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("TXT");
  await expect(card).toContainText("Extraído");
  await expect(card).toContainText("Disciplina desconhecida");
  await expect(card).toContainText("anotacoes reais");
  await expect(card).toContainText("100%");
});

test("pesquisa e filtros operam somente sobre os materiais importados", async ({ page }) => {
  await importTextMaterial(page, "recursao.txt", "Recursão possui caso base e chamada recursiva.");
  await page.goto("/biblioteca");
  const search = page.getByLabel("Pesquisar material");

  await search.fill("RECURSAO");
  await expect(page.getByRole("article", { name: "recursao.txt" })).toBeVisible();
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nenhum material encontrado" })).toBeVisible();
  await page.getByRole("button", { name: "Limpar pesquisa e filtros" }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
});
