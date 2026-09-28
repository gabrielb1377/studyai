import { expect, test } from "@playwright/test";
import type { LearningProfile } from "../src/features/learning/types";
import type { AcademyStudy } from "../src/features/academy/types";
import type { Material } from "../src/types/material";
import type { StudyRecord } from "../src/types/study-engine";
import { readIndexedDBStore } from "./helpers/indexed-db";

test("cria e persiste um estudo livre integrado à Biblioteca e ao Learning Engine", async ({ page }) => {
  await page.goto("/academy");
  await expect(page.getByRole("heading", { name: "Academy", exact: true })).toBeVisible();
  await expect(page.getByText("Seu primeiro estudo livre começa aqui")).toBeVisible();

  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Árvores binárias");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Estruturas de Dados");
  await page.getByLabel("Nível").selectOption("intermediate");
  await page.getByLabel("Objetivo").selectOption("exam");
  await page.getByLabel("Duração").selectOption("60");
  await page.getByLabel("Profundidade").selectOption("deep");
  await page.getByLabel("Estilo").selectOption("practical");
  await page.getByRole("button", { name: "Criar estudo", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Árvores binárias" })).toBeVisible();
  await expect(page.getByText("Estruturas de Dados")).toBeVisible();
  await expect(page.getByText("60 min")).toBeVisible();

  const academy = await readIndexedDBStore<AcademyStudy>(page, "academy");
  expect(academy).toHaveLength(1);
  expect(academy[0]).toMatchObject({
    topic: "Árvores binárias",
    subject: "Estruturas de Dados",
    level: "intermediate",
    goal: "exam",
    duration: 60,
    sourceType: "ai-generated",
    modules: [],
    progress: 0,
  });

  const materials = await readIndexedDBStore<Material>(page, "documents");
  expect(materials).toHaveLength(1);
  expect(materials[0]).toMatchObject({ sourceType: "ai-generated", academyStudyId: academy[0].id, studyId: academy[0].id });

  const studies = await readIndexedDBStore<StudyRecord>(page, "studies");
  expect(studies).toHaveLength(1);
  expect(studies[0]).toMatchObject({ studyId: academy[0].id, title: "Árvores binárias", progress: 0, readingTimeMinutes: 60 });

  const metadata = await readIndexedDBStore<{ key: string; value?: LearningProfile }>(page, "metadata");
  const learning = metadata.find((record) => record.key === "learning-profile:v1")?.value;
  expect(learning?.topics[academy[0].id]).toMatchObject({
    topic: "Árvores binárias",
    subject: "Estruturas de Dados",
    goal: "exam",
    estimatedMinutes: 60,
    progress: 0,
  });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Árvores binárias" })).toBeVisible();

  await page.goto("/biblioteca");
  const materialCard = page.getByRole("article", { name: "Árvores binárias" });
  await expect(materialCard.getByText("Material Gerado por IA")).toBeVisible();
  await expect(materialCard.getByRole("link", { name: "Abrir estudo" })).toHaveAttribute("href", `/academy?estudo=${academy[0].id}`);
});

test("Academy mantém o fluxo de criação utilizável no celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/academy");
  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
