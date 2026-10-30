import { expect, test } from "@playwright/test";
import { createRealStudy } from "./helpers/real-study";

for (const width of [1280, 390]) {
  test(`modo prova mantém respostas e não revela gabarito (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/tutor/quiz", (route) => route.fulfill({ json: {
      questions: Array.from({ length: 5 }, (_, index) => ({ question: `Pergunta ${index + 1}`, alternatives: ["Opção A", "Opção B", "Opção C", "Opção D"], correctAnswer: 0, explanation: "Explicação privada", difficulty: "easy" })),
    } }));
    const studyId = await createRealStudy(page);
    await page.goto(`/estudo?tema=${studyId}&aba=quiz`);
    const quiz = page.getByRole("region", { name: "Simulado & Quiz Explicado" });
    await quiz.getByRole("button", { name: "Gerar primeiro simulado" }).click();
    await expect(quiz.getByText("Pergunta 1")).toBeVisible();
    await quiz.getByLabel("Modo do simulado").selectOption("exam");
    for (const option of ["A", "B", "C", "D"]) {
      const button = quiz.getByRole("button", { name: `${option}. Opção ${option}` });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
    }
    await expect(quiz.getByText("Explicação privada")).toHaveCount(0);
    await quiz.getByRole("button", { name: "Próxima" }).click();
    await quiz.getByRole("button", { name: "B. Opção B" }).click();
    await page.reload();
    await expect(quiz.getByText("Pergunta 2")).toBeVisible();
    await expect(quiz.getByRole("button", { name: "B. Opção B" })).toHaveAttribute("aria-pressed", "true");
    await quiz.getByRole("button", { name: "Anterior" }).click();
    await expect(quiz.getByRole("button", { name: "D. Opção D" })).toHaveAttribute("aria-pressed", "true");
    await quiz.getByRole("button", { name: "5", exact: true }).click();
    const fifthAnswer = quiz.getByRole("button", { name: "A. Opção A" });
    await fifthAnswer.focus();
    await page.keyboard.press("Enter");
    await expect(fifthAnswer).toHaveAttribute("aria-pressed", "true");
    await quiz.getByRole("button", { name: "Entregar Prova" }).click();
    await expect(quiz.getByText("Simulado Finalizado")).toBeVisible();
    await expect(quiz.getByText("20%", { exact: true })).toBeVisible();
    await expect(quiz.getByText("Explicação privada").first()).toBeVisible();
  });
}

test("ferramentas continuam abrindo após seis painéis", async ({ page }) => {
  const studyId = await createRealStudy(page);
  await page.goto(`/estudo?tema=${studyId}`);
  for (const name of ["Material", "IA", "Mentor", "Flashcards", "Quiz", "Notas", "Revisão", "IA Quality", "Lab", "Resumos"]) {
    const tab = page.getByRole("tab", { name, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    const panelName = ({ IA: "Tutor IA", Revisão: "Revisão de extração", "IA Quality": "AI Quality Lab", Lab: "Laboratório" } as Record<string, string>)[name] ?? name;
    await expect(page.getByRole("tabpanel", { name: panelName, exact: true })).toBeVisible();
  }
});
