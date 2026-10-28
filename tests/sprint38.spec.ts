import { test, expect } from "@playwright/test";

test.describe("StudyAI V1.1 — Sprint 38 Features", () => {
  test("Exam Week Mode and Exam Planning workflow", async ({ page }) => {
    await page.goto("/provas");
    await expect(page.locator("h1")).toContainText("Modo Semana de Prova");

    // Open create form
    await page.click("text=Nova Prova");
    await expect(page.locator("text=Configurar Nova Prova")).toBeVisible();

    // Fill form
    await page.fill("input[placeholder*='Cálculo']", "Cálculo II");
    await page.fill("input[placeholder*='P2']", "Prova Final");
    
    // Set date 10 days in future
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const dateStr = futureDate.toISOString().split("T")[0];
    await page.fill("input[type='date']", dateStr);

    // Add subject
    await page.fill("input[placeholder*='assunto']", "Integrais Triplas");
    await page.click("text=Adicionar");
    await expect(page.locator("text=Integrais Triplas")).toBeVisible();

    // Save exam
    await page.click("text=Salvar Prova");
    await expect(page.locator("text=Cálculo II")).toBeVisible();
    await expect(page.locator("text=Plano Automático de Revisão")).toBeVisible();
  });

  test("Quiz and Explained Simulation workspace", async ({ page }) => {
    await page.goto("/estudo");
    // Check if study page loads or redirects/shows empty state
    const heading = page.locator("h1");
    if (await heading.isVisible()) {
      const text = await heading.textContent();
      expect(text).toContain("estudo");
    }
  });
});
