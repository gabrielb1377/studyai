import { expect, test } from "@playwright/test";

test("organiza materiais mockados e finaliza na biblioteca", async ({ page }) => {
  await page.goto("/organizar");

  await expect(
    page.getByRole("heading", { name: "Organizar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Organizar", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("listitem")).toHaveCount(11);
  await expect(page.getByText("Ciência da Computação", { exact: true })).toBeVisible();
  await expect(page.getByText("Aula01.pdf", { exact: true })).toBeVisible();
  await expect(page.getByText("PDF", { exact: true })).toBeVisible();
  await expect(page.getByText("2,4 MB", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Ações para Aula01.pdf" }).click();
  await page.getByRole("menuitem", { name: "Renomear" }).click();
  await page.getByLabel("Novo nome do arquivo").fill("Algoritmos — Aula 01.pdf");
  await page.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(page.getByText("Algoritmos — Aula 01.pdf", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Nome atualizado");

  await page.getByRole("button", { name: "Ações para Aula02.mp4" }).click();
  await page.getByRole("menuitem", { name: "Mover" }).click();
  await page.getByLabel("Destino do arquivo").selectOption({
    label: "2º Semestre — Banco de Dados",
  });
  await page.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(page.getByRole("status")).toContainText("Arquivo movido");

  await page.getByRole("button", { name: "Ações para Exercícios.docx" }).click();
  await page.getByRole("menuitem", { name: "Excluir" }).click();
  await expect(page.getByText("Exercícios.docx", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Arquivo removido");

  await page.getByRole("button", { name: "Finalizar organização" }).click();
  await expect(page).toHaveURL(/\/biblioteca$/);
  await expect(
    page.getByRole("heading", { name: "Biblioteca", exact: true }),
  ).toBeVisible();
});

test("a organização não apresenta overflow horizontal no celular", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/organizar");

  await expect(
    page.getByRole("heading", { name: "Organizar", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Finalizar organização" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/organization-mobile.png",
    fullPage: true,
  });
});
