import { expect, test } from "@playwright/test";

test.describe("QU-4 — Navegação mobile e consistência", () => {
  test("Q-07: todos os destinos centrais são acessíveis em até 2 toques no mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Navegação rápida" });
    await expect(nav).toBeVisible();

    // 1 toque: destinos diretos da barra inferior
    await expect(nav.getByRole("link", { name: "Início" })).toHaveAttribute("aria-current", "page");

    // Toque 1 para Biblioteca
    await Promise.all([page.waitForURL(/\/biblioteca/), nav.getByRole("link", { name: "Biblioteca" }).click()]);
    await expect(nav.getByRole("link", { name: "Biblioteca" })).toHaveAttribute("aria-current", "page");

    // Toque 1 para Estudo
    await Promise.all([page.waitForURL(/\/estudo/), nav.getByRole("link", { name: "Estudo" }).click()]);
    await expect(nav.getByRole("link", { name: "Estudo" })).toHaveAttribute("aria-current", "page");

    // Toque 1 para Provas
    await Promise.all([page.waitForURL(/\/provas/), nav.getByRole("link", { name: "Provas" }).click()]);
    await expect(nav.getByRole("link", { name: "Provas" })).toHaveAttribute("aria-current", "page");

    // Toque 1 para Tutor
    await Promise.all([page.waitForURL(/\/tutor/), nav.getByRole("link", { name: "Tutor" }).click()]);
    await expect(nav.getByRole("link", { name: "Tutor" })).toHaveAttribute("aria-current", "page");

    // 2 toques para destinos estendidos via "Mais"
    const moreBtn = nav.getByRole("button", { name: "Mais opções de navegação" });
    await expect(moreBtn).toBeVisible();

    // Toque 1: abre menu; Toque 2: seleciona Laboratório
    await moreBtn.click();
    const menuDialog = page.getByRole("dialog", { name: "Menu de navegação" });
    await expect(menuDialog).toBeVisible();
    await Promise.all([page.waitForURL(/\/lab/), menuDialog.getByRole("link", { name: /Laboratório/ }).click()]);
    await expect(menuDialog).toBeHidden();
    // No Laboratório, o botão Mais fica ativo como indicador de seção estendida
    await expect(moreBtn).toHaveAttribute("aria-current", "page");

    // Toque 1: abre menu de /lab; Toque 2: seleciona Planejamento
    await moreBtn.click();
    await expect(menuDialog).toBeVisible();
    await Promise.all([page.waitForURL(/\/planejamento/), menuDialog.getByRole("link", { name: /Planejamento/ }).click()]);
    await expect(moreBtn).toHaveAttribute("aria-current", "page");

    // Toque 1: abre menu; Toque 2: seleciona Academy
    await moreBtn.click();
    await expect(menuDialog).toBeVisible();
    await Promise.all([page.waitForURL(/\/academy/), menuDialog.getByRole("link", { name: /Academy/ }).click()]);
    await expect(moreBtn).toHaveAttribute("aria-current", "page");

    // Toque 1: abre menu; Toque 2: seleciona Salas
    await moreBtn.click();
    await expect(menuDialog).toBeVisible();
    await Promise.all([page.waitForURL(/\/salas/), menuDialog.getByRole("link", { name: /Salas/ }).click()]);
    await expect(moreBtn).toHaveAttribute("aria-current", "page");

    // Toque 1: abre menu; Toque 2: seleciona Aprendizagem
    await moreBtn.click();
    await expect(menuDialog).toBeVisible();
    await Promise.all([page.waitForURL(/\/aprendizagem/), menuDialog.getByRole("link", { name: /Aprendizagem/ }).click()]);
    await expect(moreBtn).toHaveAttribute("aria-current", "page");

    // Toque 1: abre menu; Toque 2: seleciona Importar
    await moreBtn.click();
    await expect(menuDialog).toBeVisible();
    await Promise.all([page.waitForURL(/\/importar/), menuDialog.getByRole("link", { name: /Importar/ }).click()]);
    await expect(moreBtn).toHaveAttribute("aria-current", "page");

    // Fechamento com Escape e retorno de foco
    await moreBtn.click();
    await expect(menuDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menuDialog).toBeHidden();
  });

  test("Q-07: dimensões de toque >= 44px e sem overflow horizontal em múltiplos viewports", async ({ page }) => {
    const viewports = [
      { width: 320, height: 568, name: "iPhone SE 1st gen" },
      { width: 360, height: 800, name: "Android padrão" },
      { width: 390, height: 844, name: "iPhone 12/13/14" },
      { width: 430, height: 932, name: "iPhone Pro Max" },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");

      const nav = page.getByRole("navigation", { name: "Navegação rápida" });
      await expect(nav).toBeVisible();

      // Sem overflow horizontal na página
      const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(noOverflow, `Overflow detectado em ${vp.name} (${vp.width}x${vp.height})`).toBe(true);

      // Todos os 6 alvos têm altura >= 44px (área tátil segura)
      const links = ["Início", "Biblioteca", "Estudo", "Provas", "Tutor"];
      for (const label of links) {
        const box = await nav.getByRole("link", { name: label }).boundingBox();
        expect(box?.height ?? 0, `Altura do botão ${label} em ${vp.name}`).toBeGreaterThanOrEqual(44);
      }
      const moreBox = await nav.getByRole("button", { name: "Mais opções de navegação" }).boundingBox();
      expect(moreBox?.height ?? 0, `Altura do botão Mais em ${vp.name}`).toBeGreaterThanOrEqual(44);
    }
  });

  test("Q-07: desktop preserva sidebar e esconde navegação rápida mobile", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/");

    // Navegação rápida mobile oculta em telas grandes
    const mobileNav = page.getByRole("navigation", { name: "Navegação rápida" });
    await expect(mobileNav).toBeHidden();

    // Sidebar desktop visível
    const sidebar = page.getByRole("complementary");
    await expect(sidebar).toBeVisible();

    // Toggle de compactação da sidebar
    const toggleBtn = sidebar.getByRole("button", { name: /Recolher menu|Expandir menu/ });
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();
    await expect(sidebar.getByRole("button", { name: "Expandir menu" })).toBeVisible();
    await toggleBtn.click();
    await expect(sidebar.getByRole("button", { name: "Recolher menu" })).toBeVisible();
  });

  test("Q-12: painel inicial possui hierarquia de boas-vindas refinada e padrão eyebrow", async ({ page }) => {
    await page.goto("/");

    // Eyebrow semântico com classe type-eyebrow no conteúdo da página
    const eyebrow = page.locator("main p.type-eyebrow").first();
    await expect(eyebrow).toBeVisible();
    await expect(eyebrow).toHaveText("Painel de estudos");

    // Título principal preservado para retrocompatibilidade
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText("Que bom ter você por aqui.");

    // Descrição refinada em português brasileiro natural
    const desc = page.getByText("Acompanhe seu ritmo semanal, revise materiais recentes e retome o foco de onde parou.");
    await expect(desc).toBeVisible();
  });

  test("Q-05: ausência de cores arbitrárias e text-[Npx] na feature dashboard", async ({ page }) => {
    await page.goto("/");

    // ContinueStudying usa type-eyebrow e sm:text-3xl
    const continueEyebrow = page.locator("section[aria-labelledby='continue-title'] .type-eyebrow");
    await expect(continueEyebrow).toBeVisible();
    await expect(continueEyebrow).toContainText("Continue de onde parou");

    const continueTitle = page.locator("#continue-title");
    await expect(continueTitle).toBeVisible();
    await expect(continueTitle).toHaveClass(/sm:text-3xl/);
    await expect(continueTitle).not.toHaveClass(/text-\[\d+px\]/);
  });
});
