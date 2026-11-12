import { expect, test } from "@playwright/test";

import { createRealStudy, importTextMaterial } from "./helpers/real-study";

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

test("combina disciplina e tipo, permite recuperar a busca por teclado e preserva a vista em 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await createRealStudy(page);
  await importTextMaterial(page, "outro.txt", "Material sem disciplina cadastrada.");
  await page.goto("/biblioteca");

  const search = page.getByLabel("Pesquisar material");
  await search.fill("algoritmos");
  const discipline = page.getByRole("combobox", { name: "Disciplina", exact: true });
  await discipline.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Documentos", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article", { name: "fundamentos.txt" })).toBeVisible();
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nenhum material encontrado" })).toBeVisible();
  const remove = page.getByRole("button", { name: "Remover PDF", exact: true });
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(search).toBeFocused();
  await expect(page.getByRole("article")).toHaveCount(1);

  await page.getByRole("button", { name: "Limpar tudo" }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  const list = page.getByRole("button", { name: "Visualização Lista" });
  await list.click();
  await page.reload();
  await expect(list).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByRole("button", { name: "Visualização Grade" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("troca de conta na mesma biblioteca descarta consulta e resultados privados", async ({ page }) => {
  let owner = "library-account-a";
  await page.route("**/auth/session", (route) => route.fulfill({
    json: { user: { id: owner, email: owner + "@example.com", emailVerified: true },
      csrfToken: "test", sessionId: owner, devices: [], database: "postgres" },
  }));
  await page.route("**/sync**", (route) => route.fulfill({ status: 503 }));
  await importTextMaterial(page, "privado-da-conta-a.txt", "Arquivo sintetico da conta A.");
  await page.goto("/biblioteca");
  const search = page.getByLabel("Pesquisar material");
  await search.fill("privado");
  await expect(page.getByRole("article", { name: "privado-da-conta-a.txt" })).toBeVisible();

  owner = "library-account-b";
  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "studyai:session-change" })));
  await expect(page.getByRole("heading", { name: /ainda n.o possui materiais/ })).toBeVisible();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("article")).toHaveCount(0);
});
