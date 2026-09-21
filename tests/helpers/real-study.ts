import { expect, type Page } from "@playwright/test";
import { readIndexedDBStore } from "./indexed-db";

export async function importTextMaterial(
  page: Page,
  name = "fundamentos.txt",
  content = "Estruturas de dados organizam informações. Vetores armazenam elementos em posições identificadas por índices.",
) {
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(content),
  });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Extração concluída" })).toBeVisible();
}

export async function createRealStudy(page: Page) {
  await importTextMaterial(page);
  await page.goto("/organizar");
  await page.getByRole("button", { name: "Ações para fundamentos.txt" }).click();
  await page.getByRole("menuitem", { name: "Mover" }).click();
  await page.getByRole("textbox", { name: "Curso", exact: true }).fill("Ciência da Computação");
  await page.getByRole("textbox", { name: "Semestre", exact: true }).fill("1º semestre");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Algoritmos");
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Estruturas de dados");
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText("Alterações salvas automaticamente");
  await page.getByRole("dialog").getByRole("button", { name: "Fechar" }).first().click();

  const materials = await readIndexedDBStore<{ studyId?: string }>(page, "documents");
  const studyId = materials[0]?.studyId;
  if (!studyId) throw new Error("O material não foi associado a um estudo.");
  return studyId;
}
