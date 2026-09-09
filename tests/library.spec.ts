import { expect, test } from "@playwright/test";

test("biblioteca apresenta os dez materiais com contexto e acesso à importação", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/biblioteca");
  await expect(
    page.getByRole("heading", { name: "Biblioteca", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Todos os seus materiais organizados."),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(10);
  const card = page.getByRole("article", {
    name: "Introdução à programação.pdf",
  });
  for (const value of [
    "Ciência da Computação",
    "1º semestre",
    "Algoritmos",
    "Fundamentos da programação",
    "08 de set. de 2026",
  ]) {
    await expect(card).toContainText(value);
  }
  await page
    .getByRole("link", { name: "Importar Material", exact: true })
    .click();
  await expect(page).toHaveURL(/importar/);
  await expect(
    page.getByRole("heading", { name: "Importar", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("pesquisa combina nome e contexto, ignora acentos e permite limpar filtros", async ({
  page,
}) => {
  await page.goto("/biblioteca");
  const search = page.getByRole("textbox", {
    name: "Pesquisar material",
    exact: true,
  });
  await search.fill("  RECURSAO  ");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText(
    "Lista de exercícios — Recursão.pdf",
  );
  await page.getByRole("button", { name: "Slides", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nenhum material encontrado" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Limpar pesquisa e filtros" }).click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Todos", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("article")).toHaveCount(10);
  await search.fill("sql dados");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText(
    "Consultas SQL na prática.mp4",
  );
  await search.fill("Sistemas de Informacao");
  await expect(page.getByRole("article")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Limpar pesquisa", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(10);
});

test("filtros por formato e favoritos funcionam por mouse e teclado", async ({
  page,
}) => {
  await page.goto("/biblioteca");
  for (const [name, count] of [
    ["PDF", 4],
    ["Vídeo", 2],
    ["Áudio", 2],
    ["Slides", 2],
    ["Favoritos", 4],
    ["Todos", 10],
  ] as const) {
    const button = page.getByRole("button", { name, exact: true });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("article")).toHaveCount(count);
    if (name === "Favoritos") {
      await expect(
        page.getByRole("article").filter({ hasText: "Material favorito" }),
      ).toHaveCount(count);
    }
  }
});
