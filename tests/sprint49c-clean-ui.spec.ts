import { expect, test } from "@playwright/test";

test("início vazio apresenta uma ação de importação na área inicial", async ({ page }) => {
  await page.goto("/");
  const main = page.locator("main");
  const action = main.getByRole("link", { name: "Importar material", exact: true });
  await expect(action).toHaveCount(1);
  await expect(action).toHaveAttribute("href", "/importar");
  await expect(main.getByText("Preparar uma importação")).toHaveCount(0);
});

test("sem provas, a ação principal abre o cadastro", async ({ page }) => {
  await page.goto("/provas");
  await expect(page.getByText("Nenhuma prova cadastrada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cadastrar primeira prova" })).toHaveCount(0);
  await page.getByRole("button", { name: "Nova Prova", exact: true }).click();
  await expect(page.getByLabel("Nome da Prova")).toBeVisible();
});
