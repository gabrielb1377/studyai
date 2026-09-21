import { expect, test } from "@playwright/test";
import { KnowledgeGraphBuilder } from "../src/features/semantic/KnowledgeGraphBuilder";
import { LearningKnowledgeBridge } from "../src/features/semantic/LearningKnowledgeBridge";
import { SemanticParser } from "../src/features/semantic/SemanticParser";
import { SemanticSearchService } from "../src/features/semantic/SemanticSearchService";
import type { ExtractedContent } from "../src/features/extraction/ExtractionTypes";
import { createRealStudy } from "./helpers/real-study";
import { readIndexedDBStore } from "./helpers/indexed-db";
import type { KnowledgeGraph } from "../src/features/semantic/types";

const content: ExtractedContent = {
  id: "extraction-semantic",
  studyId: "study-algoritmos",
  fileId: "file-semantic",
  fileType: "txt",
  extractedText: "Recursão\n\nRecursão é uma técnica em que uma função chama a si mesma.\n\nRecursão depende de caso base. Exemplo: fatorial usa recursão.",
  sections: [
    { type: "heading", level: 1, text: "Recursão" },
    { type: "paragraph", text: "Recursão é uma técnica em que uma função chama a si mesma." },
    { type: "paragraph", text: "Recursão depende de caso base. Exemplo: fatorial usa recursão." },
  ],
  metadata: { name: "recursao.txt", type: "text/plain", size: 180, keywords: ["recursão", "caso base", "fatorial"] },
  status: "extracted",
  createdAt: "2026-09-18T12:00:00.000Z",
};

test("parser extrai conceitos, relações e chunks sem quebrar definições", () => {
  const parsed = SemanticParser.parse(content);
  const graph = KnowledgeGraphBuilder.build(content, parsed);
  expect(graph.concepts.some((concept) => concept.name.toLocaleLowerCase("pt-BR").includes("recursão"))).toBe(true);
  expect(graph.relations.length).toBeGreaterThan(0);
  expect(graph.chunks.length).toBeGreaterThan(0);
  expect(graph.chunks[0].text).toContain("Recursão é uma técnica");
  expect(graph.statistics.conceptCount).toBe(graph.concepts.length);
});

test("busca semântica expande equivalentes, siglas e relações", () => {
  const graph = KnowledgeGraphBuilder.build(content, SemanticParser.parse(content));
  const expanded = SemanticSearchService.expandQuery("Como funciona recursão?", [graph]);
  expect(expanded.toLocaleLowerCase("pt-BR")).toContain("recursividade");
  expect(expanded).toContain("Recursão");
});

test("Learning Engine recomenda pré-requisitos encontrados no grafo", () => {
  const graph = KnowledgeGraphBuilder.build(content, SemanticParser.parse(content));
  const recommendations = LearningKnowledgeBridge.recommend([graph], [{
    studyId: content.studyId,
    subject: "Algoritmos",
    topic: "Recursão",
    knowledge: 25,
    confidence: 70,
    mastery: "Iniciante",
    classification: "difficult",
    components: { quiz: 20, flashcards: 30, time: 20, frequency: 20, recency: 30 },
  }]);
  expect(recommendations.length).toBeGreaterThan(0);
});

test("pipeline persiste o grafo e o expõe na Biblioteca, Dashboard e Workspace", async ({ page }) => {
  const studyId = await createRealStudy(page);
  const graphs = await readIndexedDBStore<KnowledgeGraph>(page, "knowledge");
  expect(graphs).toHaveLength(1);
  expect(graphs[0].statistics.conceptCount).toBeGreaterThan(0);

  await page.goto("/biblioteca");
  await expect(page.getByText("Conceitos", { exact: true })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Conhecimento estruturado" })).toBeVisible();
  await page.goto(`/estudo?tema=${studyId}&aba=knowledge`);
  await expect(page.getByRole("heading", { name: "Mapa de Conhecimento" })).toBeVisible();
  await expect(page.getByText(/conceitos/).first()).toBeVisible();
});

test("Tutor recebe conceitos e relações antes de consultar a IA", async ({ page }) => {
  await createRealStudy(page);
  let context: { knowledge?: { matchedConcepts: Array<{ name: string }>; relationshipCount: number } } | undefined;
  await page.route("**/api/tutor", async (route) => {
    context = route.request().postDataJSON().context;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ model: "test", text: "Resposta baseada no grafo." }) });
  });
  await page.goto("/tutor");
  await page.getByRole("button", { name: "Nova conversa" }).first().click();
  await page.getByLabel("Mensagem para o Tutor IA").fill("Explique vetores");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("Resposta baseada no grafo.", { exact: true })).toBeVisible();
  expect(context?.knowledge?.matchedConcepts.length).toBeGreaterThan(0);
  expect(context?.knowledge?.matchedConcepts.some((concept) => concept.name.toLocaleLowerCase("pt-BR").includes("vetor"))).toBe(true);
});
