import { expect, test } from "@playwright/test";

test("tokens semânticos oferecem contraste em cada tema", async ({ page }) => {
  await page.goto("/");
  for (const theme of ["light", "dark", "amoled"]) {
    const colors = await page.evaluate((name) => {
      document.documentElement.classList.remove("dark", "amoled");
      if (name !== "light") document.documentElement.classList.add(name);
      const style = getComputedStyle(document.documentElement);
      return ["info", "success", "warning", "error"].map((key) => [
        style.getPropertyValue("--" + key + "-foreground").trim(),
        style.getPropertyValue("--" + key + "-surface").trim(),
      ]);
    }, theme);
    for (const [foreground, background] of colors) {
      const luminance = (hex: string) => {
        expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
        const values = hex.slice(1).match(/../g)!.map((v) => {
          const n = parseInt(v, 16) / 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
      };
      const a = luminance(foreground), b = luminance(background);
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), theme).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("bordas de campos e anel de foco têm contraste em cada tema", async ({ page }) => {
  await page.goto("/biblioteca");
  for (const theme of ["light", "dark", "amoled"]) {
    const values = await page.evaluate((name) => {
      document.documentElement.classList.remove("dark", "amoled");
      if (name !== "light") document.documentElement.classList.add(name);
      const styles = getComputedStyle(document.documentElement);
      return ["--input", "--ring", "--background"].map((key) => styles.getPropertyValue(key).trim());
    }, theme);
    const luminance = (hex: string) => {
      const normalized = hex.length === 4 ? hex.slice(1).split("").map((digit) => digit + digit).join("") : hex.slice(1);
      const rgb = normalized.match(/../g)!.map((part) => parseInt(part, 16) / 255)
        .map((n) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    expect(values, theme).toEqual([expect.stringMatching(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i), expect.stringMatching(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i), expect.stringMatching(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i)]);
    for (const color of values.slice(0, 2)) {
      const a = luminance(color), b = luminance(values[2]);
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), theme).toBeGreaterThanOrEqual(3);
    }
  }
  const search = page.getByRole("textbox", { name: "Pesquisar material" });
  await search.focus();
  await expect(search).toBeFocused();
  expect(await search.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
});
