import { expect, test } from "@playwright/test";

test("preferências visuais aplicam acessibilidade e persistem", async ({ page }) => {
  await page.goto("/configuracoes");

  await page.getByRole("button", { name: "Grande", exact: true }).click();
  await page.getByLabel(/Reduzir animações/).check();
  await page.getByLabel(/Alto contraste/).check();

  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-font-scale", "large");
  await expect(root).toHaveAttribute("data-reduced-motion", "true");
  await expect(root).toHaveAttribute("data-contrast", "high");

  await page.reload();
  await expect(root).toHaveAttribute("data-font-scale", "large");
  await expect(root).toHaveAttribute("data-reduced-motion", "true");
  await expect(root).toHaveAttribute("data-contrast", "high");
});

test("tema AMOLED e visualização da Biblioteca são persistidos", async ({ page }) => {
  await page.goto("/configuracoes");
  await page.getByRole("tab", { name: "AMOLED" }).click();
  await expect(page.locator("html")).toHaveClass(/amoled/);

  await page.goto("/biblioteca");
  await page.getByRole("button", { name: "Visualização Lista" }).click();
  await expect(page.getByRole("button", { name: "Visualização Lista" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "Visualização Lista" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveClass(/amoled/);
});

test("shell mobile mantém alvos acessíveis e sem overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Navegação rápida" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  for (const label of ["Início", "Biblioteca", "Estudo", "Tutor"]) {
    const box = await page.getByRole("navigation", { name: "Navegação rápida" }).getByRole("link", { name: label }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
