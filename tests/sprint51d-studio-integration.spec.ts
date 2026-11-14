import { expect, test } from "@playwright/test";
import type { StudioDocument } from "../src/features/academy/studio/types";
import { readIndexedDBStore } from "./helpers/indexed-db";

test("recupera de deep link inexistente no Studio sem ficar preso na tela de erro", async ({ page }) => {
  await page.goto("/academy/studio?estudo=estudo-inexistente-51d&tipo=document");
  await expect(page.getByRole("heading", { name: "Conteúdo não encontrado" })).toBeVisible();

  await page.getByRole("button", { name: "Escolher outro conteúdo" }).click();
  await expect(page).toHaveURL(/\/academy\/studio$/);
  await expect(page.getByRole("heading", { name: "Documentos do Studio" })).toBeVisible();
  await expect(page.getByText("Nenhum documento salvo ainda.")).toBeVisible();
});

test("fluxo integrado 51D ponta a ponta: criação manual, template, capítulos, edição de título/conteúdo, Undo/Redo, autosave, reload, publicação, Workspace, Tutor e republicação sem duplicar", async ({
  page,
}) => {
  let aiAcademyCalled = false;
  await page.route("**/api/academy/generate", async (route) => {
    aiAcademyCalled = true;
    await route.abort("failed");
  });

  const tutorRequests: Array<{
    message: string;
    context?: { studyId?: string; document?: { title?: string } };
    chunks?: Array<{ text: string; studyId: string; fileId: string }>;
  }> = [];
  await page.route("**/api/tutor", async (route) => {
    tutorRequests.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ model: "gemini-3.7-flash", text: "Resposta integrada do Tutor 51D." }),
    });
  });

  // 1-2. Cria estudo livre e entra no Academy Studio sem chamar IA.
  await page.goto("/academy");
  await page.getByRole("button", { name: "Criar estudo livre" }).click();
  await page.getByRole("textbox", { name: "Tema", exact: true }).fill("Arquitetura de Computadores");
  await page.getByRole("textbox", { name: "Matéria", exact: true }).fill("Hardware");
  await page.getByRole("button", { name: "Criar estudo", exact: true }).click();
  await page.getByRole("link", { name: "Editar no Studio" }).click();
  expect(aiAcademyCalled).toBe(false);

  const editor = page.locator('section[aria-label="Editor"]');
  await expect(editor).toBeVisible();

  // 3. Seleciona template pedagógico.
  await editor.getByLabel("Template pedagógico").selectOption("textbook-chapter");
  await expect
    .poll(async () => (await readIndexedDBStore<StudioDocument>(page, "studio-documents"))[0]?.pedagogicalTemplate)
    .toBe("textbook-chapter");

  // 4. Cria capítulo e bloco de resumo abaixo da primeira seção.
  await editor.getByRole("button", { name: "Inserir capítulo abaixo" }).click();
  await expect(editor.getByPlaceholder("Título da seção")).toHaveValue("Novo capítulo");
  await editor.getByRole("button", { name: "Inserir resumo abaixo" }).click();
  await expect(editor.getByPlaceholder("Título da seção")).toHaveValue("Resumo");

  // 5-6. Edita título do documento, título da seção e conteúdo; testa Undo/Redo.
  const docTitleInput = editor.getByLabel("Título", { exact: true });
  await docTitleInput.fill("Arquitetura RISC-V Revisada");
  await docTitleInput.blur();
  await expect(page.getByRole("heading", { level: 2, name: "Arquitetura RISC-V Revisada" })).toBeVisible();

  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Arquitetura de Computadores" })).toBeVisible();
  await page.getByRole("button", { name: "Refazer" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Arquitetura RISC-V Revisada" })).toBeVisible();

  const sectionTitleInput = editor.getByPlaceholder("Título da seção");
  await sectionTitleInput.fill("Pipeline de 5 Estágios");
  const sectionBodyInput = editor.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)");
  await sectionBodyInput.fill("Pipeline clássico com estágios IF, ID, EX, MEM e WB v1.");

  // Clica diretamente em Salvar sem esperar blur manual anterior (não deve gerar falso conflito de versão).
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Alterações pendentes")).toBeHidden({ timeout: 10_000 });

  // 7-8. Recarrega a página e confirma recuperação do documento completo.
  await page.reload();
  await expect(editor).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Arquitetura RISC-V Revisada" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Pipeline de 5 Estágios" })).toBeVisible();
  await editor.getByRole("button", { name: "Pipeline de 5 Estágios" }).click();
  await expect(editor.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)")).toHaveValue(
    "Pipeline clássico com estágios IF, ID, EX, MEM e WB v1.",
  );

  // 9. Publica na Biblioteca (Exportar PDF).
  const sidebar = page.locator('aside[aria-label="Painel do Studio"]');
  await sidebar.getByRole("tab", { name: "Exportar" }).click();
  const download1 = page.waitForEvent("download");
  await sidebar.getByRole("button", { name: "Exportar PDF" }).click();
  await download1;
  await expect(sidebar.getByText("Exportação concluída")).toBeVisible({ timeout: 20_000 });

  const docs = await readIndexedDBStore<StudioDocument>(page, "studio-documents");
  expect(docs).toHaveLength(1);
  const docId = docs[0]!.id;
  const studyId = docs[0]!.studyId;
  const materialId = `studio-export-${docId}-pdf`;

  // 10. Abre o material no Workspace diretamente pelo botão "Abrir o material" do painel de exportação.
  await sidebar.getByRole("link", { name: "Abrir o material" }).click();
  await expect(page).toHaveURL(new RegExp(`/estudo\\?tema=${studyId}&arquivo=${materialId}&aba=material`));
  const materialPanel = page.getByRole("tabpanel", { name: "Material" });
  await expect(materialPanel.getByText(/Página 1 de \d+/)).toBeVisible({ timeout: 15_000 });
  await materialPanel.getByRole("tab", { name: "Texto" }).click();
  await expect(materialPanel).toContainText("Pipeline clássico com estágios IF, ID, EX, MEM e WB v1.");

  // 11. Consulta o Tutor na aba IA usando o material publicado v1.
  await page.getByRole("tab", { name: "IA", exact: true }).click();
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
  await page.getByLabel("Mensagem para o Tutor IA").fill("Resuma o pipeline publicado v1");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Resposta integrada do Tutor 51D.")).toBeVisible();
  expect(tutorRequests[0].context?.document?.title).toBe("Arquitetura RISC-V Revisada");
  expect(tutorRequests[0].chunks?.some((chunk) => chunk.text.includes("IF, ID, EX, MEM e WB v1"))).toBe(true);

  // 12-13. Volta ao Studio, edita diretamente e republica na Biblioteca imediatamente (sem duplicar).
  await page.goto(`/academy/studio?estudo=${encodeURIComponent(studyId)}&documento=${encodeURIComponent(docId)}&tipo=document`);
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Pipeline de 5 Estágios" }).click();
  await editor.getByPlaceholder("Escreva o conteúdo da seção (Markdown permitido)").fill(
    "Versão republicada v2 com tratamento de hazards de dados e desvios.",
  );
  await sidebar.getByRole("tab", { name: "Exportar" }).click();
  const download2 = page.waitForEvent("download");
  await sidebar.getByRole("button", { name: "Exportar PDF" }).click();
  await download2;
  await expect(sidebar.getByText("Exportação concluída")).toBeVisible({ timeout: 20_000 });

  const materials = await readIndexedDBStore<{ id: string }>(page, "documents");
  expect(materials.filter((item) => item.id.startsWith(`studio-export-${docId}`))).toHaveLength(1);

  // 14. Confirma na Biblioteca -> Tutor que o conteúdo atualizado v2 foi enviado ao Tutor.
  await page.goto("/biblioteca");
  const card = page.getByRole("article", { name: "arquitetura-risc-v-revisada-studio.pdf" }).first();
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "Tutor" }).click();
  await page.getByLabel("Mensagem para o Tutor IA").fill("Explique hazards na v2");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("region", { name: "Conversa com o Tutor IA" }).getByText("Resposta integrada do Tutor 51D.")).toHaveCount(2);
  expect(tutorRequests[1].chunks?.some((chunk) => chunk.text.includes("hazards de dados e desvios"))).toBe(true);
});
