import { expect, test } from "@playwright/test";

test("navegação, pesquisa, tema persistido e acesso à importação", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Que bom ter você por aqui.",
  );
  await page.getByRole("button", { name: "Pesquisar no workspace" }).click();
  await page
    .getByRole("textbox", { name: "Pesquisar páginas" })
    .fill("configuracoes");
  await page
    .getByRole("dialog")
    .getByRole("link", { name: /Configurações/ })
    .click();
  await expect(page).toHaveURL(/configuracoes/);
  await page.getByRole("tab", { name: "Escuro" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page
    .getByRole("button", { name: "Alternar tema claro/escuro" })
    .click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.goto("/");
  await page.getByRole("link", { name: /Importar material/ }).click();
  await expect(page).toHaveURL(/importar/);
  await expect(page.getByRole("heading", { name: "Importar" })).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: "Continuar estudando" }).click();
  await expect(page).toHaveURL(/estudo\?tema=vetores/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Vetores e matrizes",
  );
  await page.goto("/biblioteca");
  await expect(
    page.getByRole("heading", { name: "Biblioteca", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [360, 768, 1024, 1440]) {
  test(`rotas sem overflow horizontal em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/",
      "/biblioteca",
      "/estudo",
      "/importar",
      "/organizar",
      "/configuracoes",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      if (path === "/biblioteca") {
        await page.screenshot({
          path: `test-results/library-${width}.png`,
          fullPage: true,
        });
        if (width === 1440) {
          await page
            .getByRole("button", { name: "Alternar tema claro/escuro" })
            .click();
          await expect(page.locator("html")).toHaveClass(/dark/);
          await page.screenshot({
            path: "test-results/library-dark.png",
            fullPage: true,
          });
          await page
            .getByRole("button", { name: "Alternar tema claro/escuro" })
            .click();
        }
      }
      if (path === "/importar") {
        await page.screenshot({
          path: `test-results/import-${width}.png`,
          fullPage: true,
        });
      }
      if (path === "/organizar") {
        await page.screenshot({
          path: `test-results/organization-${width}.png`,
          fullPage: true,
        });
      }
    }
    if (width < 1024) {
      await page
        .getByRole("button", { name: "Abrir menu", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole("link", { name: "Biblioteca", exact: true })
        .click();
      await expect(page).toHaveURL(/biblioteca/);
      await expect(dialog).not.toBeVisible();
    }
    await page.goto("/");
    await page.screenshot({
      path: `test-results/dashboard-${width}.png`,
      fullPage: true,
    });
    if (width === 1440) {
      await page
        .getByRole("button", { name: "Alternar tema claro/escuro" })
        .click();
      await expect(page.locator("html")).toHaveClass(/dark/);
      await page.screenshot({
        path: "test-results/dashboard-dark.png",
        fullPage: true,
      });
    }
  });
}

test("atalho de pesquisa e retorno do foco ao fechar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pesquisar no workspace" }).focus();
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("textbox", { name: "Pesquisar páginas" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Pesquisar no workspace" }),
  ).toBeFocused();
});
