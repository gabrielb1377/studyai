import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const CORE_A11Y_ROUTES = [
  "/",
  "/biblioteca",
  "/estudo",
  "/provas",
  "/planejamento",
  "/lab",
  "/tutor",
  "/configuracoes",
  "/conta",
  "/storage",
] as const;

const GENERIC_NAMES = new Set(["botão", "botao", "ícone", "icone", "button", "icon"]);

function walkTsxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTsxFiles(fullPath));
    } else if (fullPath.endsWith(".tsx")) {
      results.push(fullPath);
    }
  }
  return results;
}

test.describe("QU-3 — Acessibilidade Verificável (Q-04 e Q-06)", () => {
  test("Q-06: Todos os botões size='icon*' em src/ possuem nome acessível sem rótulos genéricos", () => {
    const files = walkTsxFiles(path.join(process.cwd(), "src"));
    const violations: string[] = [];
    let audited = 0;

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const regex = /<Button\b[^>]*?size="icon(?:-[a-z]+)?"[\s\S]*?(?:\/>|<\/Button>)/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(source)) !== null) {
        audited++;
        const snippet = match[0];
        const line = source.slice(0, match.index).split("\n").length;
        const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");

        const hasAria = /aria-label|aria-labelledby|sr-only/.test(snippet);
        if (!hasAria) {
          violations.push(`${rel}:${line} sem aria-label/aria-labelledby/sr-only`);
        }

        const ariaLabelMatch = snippet.match(/aria-label="([^"]+)"/);
        if (ariaLabelMatch && GENERIC_NAMES.has(ariaLabelMatch[1].trim().toLowerCase())) {
          violations.push(`${rel}:${line} usa nome acessível genérico "${ariaLabelMatch[1]}"`);
        }
      }
    }

    expect(audited, "Deve auditar os botões size='icon*' do projeto").toBeGreaterThan(50);
    expect(violations, `Violações Q-06 encontradas:\n${violations.join("\n")}`).toEqual([]);
  });

  test("Q-04: Landmarks, skip link, hierarquia de h1 e nomes acessíveis reais em 10 rotas principais", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });

    for (const route of CORE_A11Y_ROUTES) {
      const response = await page.goto(route);
      expect(response?.status(), `Rota ${route} deve responder HTTP 200`).toBe(200);
      await expect(page.locator("main")).toBeVisible();

      // Instantâneo de acessibilidade nativo do Playwright confirma landmarks semânticos
      const bodyAria = await page.locator("body").ariaSnapshot();
      expect(bodyAria, `${route} deve expor landmark main na árvore ARIA`).toContain("- main");
      expect(bodyAria, `${route} deve expor landmark banner na árvore ARIA`).toContain("- banner");
      expect(bodyAria, `${route} deve expor landmark navigation na árvore ARIA`).toContain("- navigation");

      const audit = await page.evaluate((genericList) => {
        const generic = new Set(genericList);
        const skipLink = document.querySelector('a[href="#conteudo"]');
        const visibleH1s = Array.from(document.querySelectorAll("h1")).filter((el) => {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        });

        const getAccessibleName = (el: HTMLElement): string => {
          const ariaLabel = el.getAttribute("aria-label")?.trim();
          if (ariaLabel) return ariaLabel;
          const labelledBy = el.getAttribute("aria-labelledby")?.trim();
          if (labelledBy) {
            const text = labelledBy
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
              .join(" ")
              .trim();
            if (text) return text;
          }
          if (el.id) {
            const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            const labelText = labelEl?.textContent?.trim();
            if (labelText) return labelText;
          }
          const parentLabel = el.closest("label");
          if (parentLabel) {
            const labelText = parentLabel.textContent?.trim();
            if (labelText) return labelText;
          }
          const textContent = el.textContent?.replace(/\s+/g, " ").trim();
          if (textContent) return textContent;
          const imgAlt = el.querySelector("img[alt]")?.getAttribute("alt")?.trim();
          if (imgAlt) return imgAlt;
          const placeholder = (el as HTMLInputElement).placeholder?.trim();
          if (placeholder) return placeholder;
          return "";
        };

        const missingNames: string[] = [];
        const controls = document.querySelectorAll<HTMLElement>(
          'button, [role="button"], a[href], input:not([type="hidden"]), select, textarea',
        );

        for (const el of controls) {
          if (el.closest("[aria-hidden='true']") || el.getAttribute("aria-hidden") === "true") continue;
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          // Ignora controles internos do overlay de desenvolvimento do Next.js
          if (el.closest("nextjs-portal")) continue;

          const name = getAccessibleName(el);
          if (!name || generic.has(name.toLowerCase())) {
            missingNames.push(`<${el.tagName.toLowerCase()} class="${el.className.toString().slice(0, 40)}"> name="${name}"`);
          }
        }

        return {
          hasSkipLink: Boolean(skipLink),
          h1Count: visibleH1s.length,
          missingNames,
        };
      }, Array.from(GENERIC_NAMES));

      expect(audit.hasSkipLink, `${route} deve conter skip link para #conteudo`).toBe(true);
      expect(audit.h1Count, `${route} deve conter pelo menos um <h1> visível`).toBeGreaterThanOrEqual(1);
      expect(audit.missingNames, `${route} possui controles sem nome acessível:\n${audit.missingNames.join("\n")}`).toEqual([]);
    }
  });

  test("Q-04: Contraste computado real nos temas Claro, Escuro e AMOLED em / e /configuracoes", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const route of ["/", "/configuracoes"] as const) {
      for (const theme of ["light", "dark", "amoled"] as const) {
        await page.addInitScript((targetTheme) => {
          window.localStorage.setItem("studyai-theme", targetTheme);
        }, theme);
        await page.goto(route);
        await expect(page.locator("main")).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate((targetTheme) => {
              const cls = document.documentElement.classList;
              if (targetTheme === "light") return !cls.contains("dark") && !cls.contains("amoled");
              return cls.contains(targetTheme);
            }, theme),
          )
          .toBe(true);

        const contrastFailures = await page.evaluate(() => {
          type RGBA = [number, number, number, number];
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          const parseCssColor = (color: string): RGBA | null => {
            if (!ctx || !color || color === "transparent" || color === "rgba(0, 0, 0, 0)") return null;
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
            if (a === 0) return null;
            return [r, g, b, a / 255];
          };
          const blend = (fg: RGBA, bg: RGBA): RGBA => {
            const a = fg[3];
            return [
              fg[0] * a + bg[0] * (1 - a),
              fg[1] * a + bg[1] * (1 - a),
              fg[2] * a + bg[2] * (1 - a),
              1,
            ];
          };
          const lum = ([r, g, b]: RGBA): number => {
            const [sr, sg, sb] = [r, g, b].map((c) => {
              const v = c / 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
          };
          const ratio = (c1: RGBA, c2: RGBA): number => {
            const l1 = lum(c1);
            const l2 = lum(c2);
            return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          };
          const effectiveBg = (el: HTMLElement): RGBA => {
            const chain: RGBA[] = [];
            let curr: HTMLElement | null = el;
            while (curr) {
              const bg = parseCssColor(getComputedStyle(curr).backgroundColor);
              if (bg && bg[3] > 0) {
                chain.push(bg);
                if (bg[3] >= 0.99) break;
              }
              curr = curr.parentElement;
            }
            const rootFallback = parseCssColor(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255, 1];
            let acc: RGBA = rootFallback;
            for (let i = chain.length - 1; i >= 0; i--) {
              acc = blend(chain[i], acc);
            }
            return acc;
          };

          const failures: string[] = [];
          const nodes = document.querySelectorAll<HTMLElement>("main h1, main h2, main h3, main p, main a, main button, nav a");
          for (const el of nodes) {
            if (el.closest(".sr-only") || el.classList.contains("sr-only")) continue;
            const style = getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) < 0.9) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            const text = Array.from(el.childNodes)
              .filter((n) => n.nodeType === Node.TEXT_NODE)
              .map((n) => n.textContent?.trim() ?? "")
              .join(" ")
              .trim();
            if (!text) continue;

            const fgRaw = parseCssColor(style.color);
            if (!fgRaw) continue;
            const bg = effectiveBg(el);
            const fg = fgRaw[3] < 1 ? blend(fgRaw, bg) : fgRaw;
            const cr = ratio(fg, bg);
            const fontSize = parseFloat(style.fontSize);
            const fontWeight = parseInt(style.fontWeight, 10) || 400;
            const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
            const threshold = isLarge ? 3.0 : 4.5;

            if (cr < threshold) {
              failures.push(`${el.tagName} "${text.slice(0, 32)}": ${cr.toFixed(2)}:1 < ${threshold}:1`);
            }
          }
          return failures;
        });

        expect(
          contrastFailures,
          `Falhas de contraste em ${route} (${theme}):\n${contrastFailures.join("\n")}`,
        ).toEqual([]);
      }
    }
  });

  test("Q-04: Navegação por teclado, foco visível, SearchDialog (Ctrl+K/Esc) e DropdownMenu acessíveis", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();

    // Tab inicial alcança o skip link com foco visível
    await page.keyboard.press("Tab");
    const firstFocused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const style = getComputedStyle(el);
      return {
        tag: el.tagName,
        href: el.getAttribute("href"),
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth),
      };
    });
    expect(firstFocused?.href).toBe("#conteudo");
    expect(firstFocused?.outlineStyle).not.toBe("none");
    expect(firstFocused?.outlineWidth ?? 0).toBeGreaterThan(0);

    // SearchDialog abre por teclado (Ctrl+K), expõe dialog acessível e fecha com Escape
    await page.keyboard.press("Control+k");
    const searchDialog = page.getByRole("dialog", { name: "Pesquisa Global" });
    await expect(searchDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(searchDialog).toBeHidden();

    // DropdownMenu pessoal abre por teclado (Enter), expõe menu acessível e fecha com Escape
    const personalMenuBtn = page.getByRole("button", { name: "Abrir menu pessoal" });
    await personalMenuBtn.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Configurações" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });
});
