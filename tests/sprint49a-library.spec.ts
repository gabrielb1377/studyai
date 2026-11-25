import { expect, test } from "@playwright/test";
import { importTextMaterial } from "./helpers/real-study";

test("filtros mobile abrem por teclado e mantêm a seleção visível ao fechar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await importTextMaterial(page, "recursao.txt", "Conteúdo para pesquisa.");
  await page.goto("/biblioteca");
  const toggle = page.getByRole("button", { name: /Filtros/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "PDF", exact: true })).toBeHidden();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Remover PDF" })).toBeVisible();
  await page.getByRole("button", { name: "Remover PDF" }).click();
  await expect(page.getByRole("article", { name: "recursao.txt" })).toBeVisible();
});
