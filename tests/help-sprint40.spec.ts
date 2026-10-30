import { test, expect } from "@playwright/test";

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 620 }]) {
  test(`Central de Ajuda é rolável em ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Abrir Central de Ajuda" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByText("Estudar e praticar", { exact: false }).click();
    const scrollArea = dialog.locator(".overflow-y-auto");
    await expect(scrollArea).toHaveCount(1);
    const scrollable = await scrollArea.evaluate((element) => element.scrollHeight > element.clientHeight);
    expect(scrollable).toBe(true);
    await scrollArea.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(await scrollArea.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(dialog.getByRole("button", { name: /fechar|close/i })).toBeVisible();
  });
}

test("categorias aceitam teclado e a busca encontra o guia da Academy", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 620 });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir Central de Ajuda" }).click();
  const dialog = page.getByRole("dialog");
  const category = dialog.getByText("Estudar e praticar", { exact: false });
  await category.focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("button", { name: /Gerar conteúdo na Academy/ })).toBeVisible();
  await dialog.getByPlaceholder("Ex.: Como importar PDF?").fill("academy projeto");
  await dialog.getByRole("button", { name: /Gerar conteúdo na Academy/ }).click();
  await expect(dialog.getByText(/selecione material de estudo/)).toBeVisible();
  await dialog.getByRole("button", { name: /Voltar aos guias/ }).click();
  await expect(dialog.getByPlaceholder("Ex.: Como importar PDF?")).toHaveValue("academy projeto");
});
