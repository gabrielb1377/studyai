import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((offset) => {
    const channel = parseInt(clean.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function extractThemeTokens(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`Bloco de tema não encontrado para ${selector}`);
  const tokens: Record<string, string> = {};
  for (const [, name, value] of match[1].matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[name] = value.toLowerCase();
  }
  return tokens;
}

test.describe("QU-2 — Quality Upgrade: Tipografia, Escala e Limpeza de Tokens", () => {
  test("Q-03: Todos os pares de texto/superfície nos temas Claro, Escuro e AMOLED cumprem WCAG 2.2 AA (>= 4.50:1)", () => {
    const css = readFileSync(path.join(process.cwd(), "src/styles/globals.css"), "utf8");
    const themeSelectors = [":root", ".dark", ".amoled"] as const;

    const pairs: Array<[string, string]> = [
      ["--foreground", "--background"],
      ["--foreground", "--card"],
      ["--muted-foreground", "--background"],
      ["--muted-foreground", "--card"],
      ["--muted-foreground", "--muted"],
      ["--muted-foreground", "--secondary"],
      ["--muted-foreground", "--sidebar"],
      ["--primary", "--background"],
      ["--primary", "--card"],
      ["--primary-foreground", "--primary"],
      ["--secondary-foreground", "--secondary"],
      ["--accent-foreground", "--accent"],
      ["--destructive", "--background"],
      ["--destructive", "--card"],
      ["--info-foreground", "--info-surface"],
      ["--success-foreground", "--success-surface"],
      ["--warning-foreground", "--warning-surface"],
      ["--error-foreground", "--error-surface"],
    ];

    for (const selector of themeSelectors) {
      const tokens = extractThemeTokens(css, selector);
      for (const [fgToken, bgToken] of pairs) {
        const fg = tokens[fgToken];
        const bg = tokens[bgToken];
        expect(fg, `${selector} deve definir ${fgToken}`).toBeTruthy();
        expect(bg, `${selector} deve definir ${bgToken}`).toBeTruthy();
        const ratio = contrastRatio(fg, bg);
        expect(
          ratio,
          `${selector} ${fgToken} (${fg}) sobre ${bgToken} (${bg}) deve ter contraste >= 4.50:1 (obtido ${ratio.toFixed(2)}:1)`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("Q-11: prefers-reduced-motion sem duplicação, DropdownMenu com raios unificados e manifest alinhado a #f8faf7", () => {
    const css = readFileSync(path.join(process.cwd(), "src/styles/globals.css"), "utf8");
    const reducedMotionMatches = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)/g) ?? [];
    expect(reducedMotionMatches.length, "Deve haver exatamente um bloco @media (prefers-reduced-motion: reduce)").toBe(1);

    const dropdownSource = readFileSync(path.join(process.cwd(), "src/components/ui/dropdown-menu.tsx"), "utf8");
    expect(dropdownSource).not.toContain("rounded-md");
    expect(dropdownSource).not.toContain("rounded-sm");

    const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "public/manifest.webmanifest"), "utf8")) as {
      background_color?: string;
    };
    expect(manifest.background_color?.toLowerCase()).toBe("#f8faf7");
  });

  test("Q-03: Telas e shell tocados não contêm classes tipográficas abaixo de 12px", () => {
    const touchedFiles = [
      "src/app/page.tsx",
      "src/components/page-heading.tsx",
      "src/components/layout/sidebar.tsx",
      "src/components/layout/search-dialog.tsx",
      "src/features/dashboard/recent-topics.tsx",
      "src/features/dashboard/weekly-progress.tsx",
      "src/features/planning/components/WeeklyGoalPanel.tsx",
    ];

    for (const relativePath of touchedFiles) {
      const source = readFileSync(path.join(process.cwd(), relativePath), "utf8");
      expect(source, `${relativePath} não deve conter text-[9px|10px|11px]`).not.toMatch(/text-\[(9|10|11)px\]/);
    }
  });

  test("Q-01/Q-03/Q-11 em navegador (desktop 1366x768): fonte Inter ativa, CLS baixo, themeColor #f8faf7 e texto visível >= 12px", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.addInitScript(() => {
      (window as unknown as { __qu2Cls?: number }).__qu2Cls = 0;
      if (typeof PerformanceObserver !== "undefined") {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) {
            if (!entry.hadRecentInput && typeof entry.value === "number") {
              (window as unknown as { __qu2Cls: number }).__qu2Cls += entry.value;
            }
          }
        });
        try {
          observer.observe({ type: "layout-shift", buffered: true });
        } catch {
          // Navegador sem suporte a layout-shift
        }
      }
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const fontCheck = await page.evaluate(() => {
      const bodyFont = getComputedStyle(document.body).fontFamily;
      const htmlVar = getComputedStyle(document.documentElement).getPropertyValue("--font-inter").trim();
      const lightThemeColor = document
        .querySelector('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')
        ?.getAttribute("content");
      const cls = (window as unknown as { __qu2Cls?: number }).__qu2Cls ?? 0;
      const overflow = document.documentElement.scrollWidth > window.innerWidth;
      return { bodyFont, htmlVar, lightThemeColor, cls, overflow };
    });

    expect(fontCheck.htmlVar.length, "--font-inter deve estar definida no elemento html").toBeGreaterThan(0);
    expect(fontCheck.bodyFont.toLowerCase()).toContain("inter");
    expect(fontCheck.lightThemeColor?.toLowerCase()).toBe("#f8faf7");
    expect(fontCheck.cls, "CLS medido deve permanecer abaixo de 0.05").toBeLessThan(0.05);
    expect(fontCheck.overflow, "Não deve haver overflow horizontal em 1366x768").toBe(false);

    // Abre a pesquisa global por teclado e valida tamanho mínimo >= 12px em todos os textos visíveis
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible();

    const smallTexts = await page.evaluate(() => {
      const violations: Array<{ tag: string; text: string; size: number }> = [];
      const roots = document.querySelectorAll("header, nav, main, [role='dialog']");
      for (const root of roots) {
        const elements = root.querySelectorAll("*");
        for (const el of elements) {
          const htmlEl = el as HTMLElement;
          if (htmlEl.closest(".sr-only") || htmlEl.classList.contains("sr-only")) continue;
          const directText = Array.from(el.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent?.trim() ?? "")
            .join(" ")
            .trim();
          if (!directText) continue;
          const style = getComputedStyle(htmlEl);
          if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) continue;
          const rect = htmlEl.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const size = parseFloat(style.fontSize);
          if (size < 11.9) {
            violations.push({ tag: el.tagName, text: directText.slice(0, 40), size });
          }
        }
      }
      return violations;
    });

    expect(smallTexts, `Textos visíveis abaixo de 12px encontrados: ${JSON.stringify(smallTexts)}`).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("Q-03 em navegador (mobile 390x844): sem overflow horizontal e textos visíveis >= 12px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const mobileAudit = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth > window.innerWidth;
      const smallTexts: Array<{ text: string; size: number }> = [];
      const roots = document.querySelectorAll("header, nav, main");
      for (const root of roots) {
        for (const el of root.querySelectorAll("*")) {
          const htmlEl = el as HTMLElement;
          if (htmlEl.closest(".sr-only") || htmlEl.classList.contains("sr-only")) continue;
          const directText = Array.from(el.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent?.trim() ?? "")
            .join(" ")
            .trim();
          if (!directText) continue;
          const style = getComputedStyle(htmlEl);
          if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) continue;
          const rect = htmlEl.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const size = parseFloat(style.fontSize);
          if (size < 11.9) {
            smallTexts.push({ text: directText.slice(0, 40), size });
          }
        }
      }
      return { overflow, smallTexts };
    });

    expect(mobileAudit.overflow, "Não deve haver overflow horizontal em 390x844").toBe(false);
    expect(mobileAudit.smallTexts, `Textos visíveis abaixo de 12px em 390x844: ${JSON.stringify(mobileAudit.smallTexts)}`).toEqual([]);
  });
});
