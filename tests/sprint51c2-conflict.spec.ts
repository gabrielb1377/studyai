import { expect, test } from "@playwright/test";
import type { StudioDocument } from "../src/features/academy/studio/types";
import { readIndexedDBStore } from "./helpers/indexed-db";

test("edição obsoleta em outra aba não substitui a versão salva", async ({ page, context }) => {
  await page.goto("/academy");
  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Concorrência entre abas");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Testes");
  await page.getByRole("button", { name: "Criar estudo", exact: true }).click();
  await Promise.all([
    page.waitForURL(/\/academy\/studio\?estudo=/),
    page.getByRole("link", { name: "Editar no Studio" }).click(),
  ]);
  const a = page.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)");
  await expect(a).toBeVisible();
  const second = await context.newPage();
  await second.goto(page.url());
  const b = second.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)");
  await expect(b).toBeVisible();
  await a.fill("Edição confirmada pela aba A");
  await a.blur();
  await expect.poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections[0]?.content).toBe("Edição confirmada pela aba A");
  await b.fill("Edição concorrente da aba B");
  await b.blur();
  await expect(
    second.getByRole("alert").filter({ hasText: "O documento foi alterado em outra operação" }),
  ).toBeVisible();
  const stored = (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0];
  expect(stored.documentStructure?.sections[0]?.content).toBe("Edição confirmada pela aba A");
  await expect(b).toHaveValue("Edição concorrente da aba B");
});
