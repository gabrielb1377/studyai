import { expect, test } from "@playwright/test";

for (const width of [320, 360, 390]) {
  test(`cabeçalho do Tutor é legível e alterna modo em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/tutor");
    const title = page.getByRole("heading", { name: "Nova conversa" });
    const modes = page.getByLabel("Modo do assistente");
    await expect(title).toBeVisible();
    expect((await title.boundingBox())!.width).toBeGreaterThanOrEqual(150);
    await expect(modes.getByRole("button", { name: "Tutor", exact: true })).toHaveAttribute("aria-pressed", "true");
    const professor = modes.getByRole("button", { name: "Professor", exact: true });
    await professor.focus();
    await page.keyboard.press("Enter");
    await expect(professor).toHaveAttribute("aria-pressed", "true");
    await expect(modes.getByRole("button", { name: "Tutor", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
