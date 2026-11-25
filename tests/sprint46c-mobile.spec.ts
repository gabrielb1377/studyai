import { expect, test } from "@playwright/test";

const routes = ["/", "/biblioteca", "/estudo", "/estudo/revisao", "/provas", "/tutor"];

for (const width of [320, 360, 390, 768, 1280]) {
  test(`rotas principais cabem em ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    for (const path of routes) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(width);
    }

    await page.goto("/");
    const stats = page.getByRole("region", { name: "Resumo dos dados de estudo" });
    await expect(stats).toBeVisible();
    expect(await stats.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
      await stats.evaluate((element) => element.clientWidth),
    );
  });
}

test("menu mobile devolve o foco e Provas tem atalho direto", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Abrir menu", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("dialog", { name: "Menu de navega\u00e7\u00e3o" });
  await expect(menu.getByRole("link", { name: "Academy", exact: true })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Laborat\u00f3rio", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  const nav = page.getByRole("navigation", { name: "Navega\u00e7\u00e3o r\u00e1pida" });
  const exams = nav.getByRole("link", { name: "Provas", exact: true });
  await exams.click();
  await expect(page).toHaveURL(/\/provas$/);
  await expect(exams).toHaveAttribute("aria-current", "page");

  await page.locator("html").evaluate((element) => element.setAttribute("data-density", "compact"));
  const bottomPadding = await page.locator("main").evaluate((element) => parseFloat(getComputedStyle(element).paddingBottom));
  expect(bottomPadding).toBeGreaterThanOrEqual((await nav.boundingBox())!.height);
});
