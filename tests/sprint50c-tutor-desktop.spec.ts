import { expect, test } from "@playwright/test";

test("Tutor desktop exibe histórico preenchido, alterna conversas e mantém controles acessíveis sem sobreposição", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  let replyIndex = 0;
  await page.route("**/api/tutor", async (route) => {
    replyIndex += 1;
    const body = route.request().postDataJSON() as { message?: string };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        model: "mock",
        text: `Resposta sintética ${replyIndex}: ${body.message ?? ""}`,
      }),
    });
  });

  await page.goto("/tutor");

  const sidebar = page.getByLabel("Conversas do Tutor IA");
  const conversationRegion = page.getByRole("region", { name: "Conversa com o Tutor IA" });
  const newButton = sidebar.getByRole("button", { name: "Nova conversa", exact: true });
  const searchInput = sidebar.getByRole("textbox", { name: "Pesquisar conversa" });

  await expect(newButton).toBeVisible();
  await expect(searchInput).toBeVisible();

  await newButton.click();
  await page.getByLabel("Mensagem para o Tutor IA").fill("Conceito de Matrizes");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(conversationRegion.getByText("Resposta sintética 1: Conceito de Matrizes")).toBeVisible();

  await newButton.click();
  await page.getByLabel("Mensagem para o Tutor IA").fill("Derivadas Parciais");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(conversationRegion.getByText("Resposta sintética 2: Derivadas Parciais")).toBeVisible();

  const historyList = sidebar.getByRole("list", { name: "Histórico de conversas" });
  await expect(historyList).toBeVisible();
  await expect(historyList.getByRole("listitem")).toHaveCount(2);

  const firstItemButton = historyList.getByRole("button", { name: /Conceito de Matrizes/ });
  const secondItemButton = historyList.getByRole("button", { name: /Derivadas Parciais/ });

  await expect(secondItemButton).toHaveAttribute("aria-current", "page");
  await firstItemButton.click();
  await expect(firstItemButton).toHaveAttribute("aria-current", "page");
  await expect(conversationRegion.getByText("Resposta sintética 1: Conceito de Matrizes")).toBeVisible();
  await expect(conversationRegion.getByText("Resposta sintética 2: Derivadas Parciais")).toHaveCount(0);

  await secondItemButton.click();
  await expect(secondItemButton).toHaveAttribute("aria-current", "page");
  await expect(conversationRegion.getByText("Resposta sintética 2: Derivadas Parciais")).toBeVisible();

  await searchInput.fill("Matrizes");
  await expect(historyList.getByRole("listitem")).toHaveCount(1);
  await expect(firstItemButton).toBeVisible();
  await searchInput.fill("");
  await expect(historyList.getByRole("listitem")).toHaveCount(2);

  const sidebarBox = await sidebar.boundingBox();
  const mainBox = await conversationRegion.boundingBox();
  expect(sidebarBox).not.toBeNull();
  expect(mainBox).not.toBeNull();
  expect(sidebarBox!.width).toBeGreaterThan(180);
  expect(mainBox!.width).toBeGreaterThan(400);
  expect(sidebarBox!.x + sidebarBox!.width).toBeLessThanOrEqual(mainBox!.x + 1);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
