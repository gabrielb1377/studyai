import { test, expect } from "@playwright/test";

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 620 }]) {
  test(`Central de Ajuda é rolável em ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Abrir Central de Ajuda" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const scrollArea = dialog.locator(".overflow-y-auto");
    await expect(scrollArea).toHaveCount(1);
    const scrollable = await scrollArea.evaluate((element) => element.scrollHeight > element.clientHeight);
    expect(scrollable).toBe(true);
    await scrollArea.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(await scrollArea.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(dialog.getByRole("button", { name: /fechar|close/i })).toBeVisible();
  });
}
