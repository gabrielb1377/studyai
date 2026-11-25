import { expect, test } from "@playwright/test";
import type { StudioDocument } from "../src/features/academy/studio/types";
import { readIndexedDBStore } from "./helpers/indexed-db";

test("rascunho digitado é salvo sem retirar foco do editor", async ({ page }) => {
  await page.goto("/academy");
  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Persistência de rascunho");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Testes");
  await page.getByRole("button", { name: "Criar estudo", exact: true }).click();
  await page.getByRole("link", { name: "Editar no Studio" }).click();
  const input = page.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)");
  await expect(input).toBeVisible();
  await input.fill("Conteúdo sintético que deve sobreviver à recuperação.");
  await expect.poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections[0]?.content, { timeout: 8000 }).toBe("Conteúdo sintético que deve sobreviver à recuperação.");
  await page.reload();
  await expect(input).toHaveValue("Conteúdo sintético que deve sobreviver à recuperação.");
});

import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("gravação obsoleta não substitui revisão mais recente", async () => {
  const source = readFileSync("src/features/academy/studio/storage.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const record: Record<string, unknown> = { id: "doc", studyId: "study", title: "Atual", type: "document", template: "academic", customization: {}, version: 2, status: "draft", createdAt: "2026-01-01", updatedAt: "2026-01-02" };
  let saved = record;
  const manager = { transaction: async (_stores: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({ get: async () => saved, put: async (_store: string, value: typeof record) => { saved = value; } }), put: async (_store: string, value: typeof record) => { saved = value; } };
  const compiled = { exports: {} as Record<string, unknown> };
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, require: () => ({ StorageManager: manager }), Date });
  const storage = compiled.exports.StudioStorage as { put(value: unknown): Promise<unknown> };
  let rejected = false;
  try { await storage.put({ ...record, title: "Antigo", version: 1 }); } catch { rejected = true; }
  expect(rejected).toBe(true);
  expect(saved.title).toBe("Atual");
  const result = await storage.put({ ...record, title: "Novo" }) as typeof record;
  expect(result.version).toBe(3);
  expect(saved.title).toBe("Novo");
});

test("retry após falha mantém a edição local", async ({ page }) => {
  await page.goto("/academy");
  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Recuperação do rascunho");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Testes");
  await page.getByRole("button", { name: "Criar estudo", exact: true }).click();
  await page.getByRole("link", { name: "Editar no Studio" }).click();
  const input = page.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)");
  await expect(input).toBeVisible();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    let fail = true;
    IDBObjectStore.prototype.put = function(value, key) {
      if (fail && this.name === "studio-documents" && JSON.stringify(value).includes("edição recuperável")) {
        fail = false;
        throw new DOMException("Falha sintética", "QuotaExceededError");
      }
      return key === undefined ? original.call(this, value) : original.call(this, value, key);
    };
  });
  await input.fill("edição recuperável");
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 12000 });
  await expect(input).toHaveValue("edição recuperável");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect.poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections[0]?.content, { timeout: 10000 }).toBe("edição recuperável");
});

test("publica e republica material do Studio sem duplicar, abre no Workspace e envia apenas conteúdo publicado ao Tutor", async ({ page }) => {
  const tutorRequests: Array<{
    message: string;
    context?: { studyId?: string; document?: { title?: string } };
    chunks?: Array<{ text: string; studyId: string; fileId: string }>;
  }> = [];
  await page.route("**/api/tutor", async (route) => {
    tutorRequests.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ model: "gemini-3.7-flash", text: "Resposta do Tutor no fluxo 51C." }),
    });
  });

  // 1. Cria estudo livre e edita manualmente no Studio (sem publicar ainda).
  await page.goto("/academy");
  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Consenso Distribuído");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Sistemas Distribuídos");
  await page.getByRole("button", { name: "Criar estudo", exact: true }).click();
  await page.getByRole("link", { name: "Editar no Studio" }).click();

  const editor = page.locator('section[aria-label="Editor"]');
  await expect(editor).toBeVisible();
  const textarea = editor.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)");
  await textarea.fill("Rascunho privado nao publicado zebra.");
  await textarea.blur();
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections[0]?.content, { timeout: 10_000 })
    .toBe("Rascunho privado nao publicado zebra.");

  const docsCreated = await readIndexedDBStore<StudioDocument>(page, "studio-documents");
  const docId = docsCreated[0]!.id;
  const studyId = docsCreated[0]!.studyId;

  // 2. Antes da publicação, o rascunho não deve ir como contexto ao Tutor.
  await page.goto(`/estudo?tema=${encodeURIComponent(studyId)}&aba=ia`);
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
  await page.getByLabel("Mensagem para o Tutor IA").fill("O que diz o texto sobre zebra?");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Resposta do Tutor no fluxo 51C.")).toBeVisible();
  expect(tutorRequests).toHaveLength(1);
  expect(JSON.stringify(tutorRequests[0].context ?? {})).not.toContain("zebra");
  expect(tutorRequests[0].chunks ?? []).toHaveLength(0);

  // 3. Volta ao Studio, atualiza o conteúdo para v1 e publica na Biblioteca.
  await page.goto(`/academy/studio?estudo=${encodeURIComponent(studyId)}&documento=${encodeURIComponent(docId)}&tipo=document`);
  await expect(editor).toBeVisible();
  await textarea.fill("Conteúdo publicado v1 sobre protocolo Raft.");
  await textarea.blur();
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections[0]?.content, { timeout: 10_000 })
    .toBe("Conteúdo publicado v1 sobre protocolo Raft.");
  await expect(page.getByText("Alterações pendentes")).toBeHidden({ timeout: 10_000 });

  const sidebar = page.locator('aside[aria-label="Painel do Studio"]');
  await sidebar.getByRole("tab", { name: "Exportar" }).click();
  const firstDownload = page.waitForEvent("download");
  await sidebar.getByRole("button", { name: "Exportar PDF" }).click();
  await firstDownload;
  await expect(sidebar.getByText("Exportação concluída")).toBeVisible({ timeout: 20_000 });

  const expectedMaterialId = `studio-export-${docId}-pdf`;
  const materialsAfterV1 = await readIndexedDBStore<{ id: string }>(page, "documents");
  expect(materialsAfterV1.filter((item) => item.id === expectedMaterialId)).toHaveLength(1);

  // 4. Edita novo rascunho sem republicar: o Tutor ainda deve enxergar somente a v1 publicada.
  await textarea.fill("Rascunho intermediário secreto quimera.");
  await textarea.blur();
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections[0]?.content, { timeout: 10_000 })
    .toBe("Rascunho intermediário secreto quimera.");
  await expect(page.getByText("Alterações pendentes")).toBeHidden({ timeout: 10_000 });

  await page.goto(`/estudo?tema=${encodeURIComponent(studyId)}&aba=ia`);
  await page.getByLabel("Mensagem para o Tutor IA").fill("Explique protocolo Raft e quimera");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Resposta do Tutor no fluxo 51C.")).toHaveCount(2);
  expect(tutorRequests[1].chunks?.some((chunk) => chunk.text.includes("protocolo Raft"))).toBe(true);
  expect(JSON.stringify(tutorRequests[1].chunks ?? [])).not.toContain("quimera");
  expect(JSON.stringify(tutorRequests[1].context ?? {})).not.toContain("quimera");

  // 5. Atualiza para v2 e republica sem duplicar o material.
  await page.goto(`/academy/studio?estudo=${encodeURIComponent(studyId)}&documento=${encodeURIComponent(docId)}&tipo=document`);
  await expect(editor).toBeVisible();
  await textarea.fill("Conteúdo republicado v2 sobre algoritmo Paxos.");
  await textarea.blur();
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.documentStructure?.sections[0]?.content, { timeout: 10_000 })
    .toBe("Conteúdo republicado v2 sobre algoritmo Paxos.");
  await expect(page.getByText("Alterações pendentes")).toBeHidden({ timeout: 10_000 });

  await sidebar.getByRole("tab", { name: "Exportar" }).click();
  const secondDownload = page.waitForEvent("download");
  await sidebar.getByRole("button", { name: "Exportar PDF" }).click();
  await secondDownload;
  await expect(sidebar.getByText("Exportação concluída")).toBeVisible({ timeout: 20_000 });

  const materialsAfterV2 = await readIndexedDBStore<{ id: string }>(page, "documents");
  expect(materialsAfterV2.filter((item) => item.id.startsWith(`studio-export-${docId}`))).toHaveLength(1);

  // 6. Abre a partir da Biblioteca no Workspace/Estudo e depois no Tutor.
  await page.goto("/biblioteca");
  const card = page.getByRole("article", { name: "consenso-distribuido-studio.pdf" }).first();
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "Abrir material" }).click();
  await expect(page).toHaveURL(new RegExp(`/estudo\\?tema=${studyId}&arquivo=${expectedMaterialId}&aba=material`));
  const materialPanel = page.getByRole("tabpanel", { name: "Material" });
  await expect(materialPanel.getByText("consenso-distribuido-studio.pdf").first()).toBeVisible({ timeout: 15_000 });
  await expect(materialPanel.getByText(/Página 1 de \d+/)).toBeVisible({ timeout: 15_000 });
  await materialPanel.getByRole("tab", { name: "Texto" }).click();
  await expect(materialPanel).toContainText("Conteúdo republicado v2 sobre algoritmo Paxos.");

  await page.goto("/biblioteca");
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "Tutor" }).click();
  await expect(page).toHaveURL(new RegExp(`/estudo\\?tema=${studyId}&arquivo=${expectedMaterialId}&aba=ia`));
  await page.getByLabel("Mensagem para o Tutor IA").fill("Como funciona o algoritmo Paxos?");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Resposta do Tutor no fluxo 51C.")).toHaveCount(3);
  expect(tutorRequests[2].context?.document?.title).toBe("Consenso Distribuído");
  expect(tutorRequests[2].chunks?.some((chunk) => chunk.text.includes("algoritmo Paxos"))).toBe(true);

  // 7. Também disponibiliza o conteúdo publicado na seleção por disciplina do Tutor (/tutor).
  await page.goto("/tutor");
  await page.getByText("Estudar matéria completa").click();
  await page.getByLabel("Disciplina").selectOption(JSON.stringify(["", "", "Sistemas Distribuídos"]));
  await page.getByRole("button", { name: "Selecionar todos" }).click();
  await page.getByRole("button", { name: "Confirmar seleção e abrir conversa" }).click();
  await page.getByLabel("Mensagem para o Tutor IA").fill("Resuma algoritmo Paxos publicado");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Resposta do Tutor no fluxo 51C.")).toBeVisible();
  expect(tutorRequests[3].chunks?.some((chunk) => chunk.text.includes("algoritmo Paxos"))).toBe(true);
});
