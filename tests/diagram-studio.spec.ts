import { expect, test, type Download, type Page } from "@playwright/test";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import type { AcademyStudy } from "../src/features/academy/types";
import type { StudioDocument, StudioDocumentType } from "../src/features/academy/studio/types";
import { layoutDiagram } from "../src/features/diagrams/layout";
import { renderDiagramSvg, toMermaidSource, validateSvgMarkup } from "../src/features/diagrams/render/svg";
import { parseMermaid } from "../src/features/diagrams/parse/mermaid";
import { parseDiagramProposal } from "../src/features/diagrams/parse/proposal";
import { DIAGRAM_LIMITS, normalizeDiagram } from "../src/features/diagrams/limits";
import { createDiagramFromTemplate } from "../src/features/diagrams/templates";
import { diagramTypes, type DiagramDocument } from "../src/features/diagrams/types";
import { extractPdfText } from "./helpers/pdf-text";
import { readIndexedDBStore } from "./helpers/indexed-db";

const NOW = "2026-10-20T12:00:00.000Z";
const STUDY_ID = "study-diagram-fixture";
const CONTENT_ID = "content-diagram-fixture";

function studyFixture(): AcademyStudy {
  return {
    id: STUDY_ID,
    title: "Estudo de diagramas",
    topic: "Fluxo do método",
    subject: "Métodos de estudo",
    level: "basic",
    goal: "college",
    duration: 30,
    language: "pt-BR",
    depth: "balanced",
    style: "structured",
    status: "ready",
    createdAt: NOW,
    updatedAt: NOW,
    sourceType: "ai-generated",
    modules: [],
    progress: 0,
    contents: [
      {
        id: CONTENT_ID,
        kind: "study-material",
        title: "Material de diagramas",
        objective: "Validar o Diagram Studio.",
        prerequisites: [],
        modules: [],
        chapters: [],
        concepts: [],
        examples: [],
        exercises: [],
        summary: "Resumo do material.",
        review: [],
        nextSteps: [],
        studyPlan: [],
        flashcards: [],
        quiz: [],
        generatedAt: NOW,
        provider: "gemini",
        model: "gemini-test",
      },
    ],
    exports: [],
  };
}

function diagramFixture(overrides: Partial<DiagramDocument> = {}): DiagramDocument {
  return {
    id: "diagram-fixture",
    title: "Fluxo do método",
    type: "flowchart",
    direction: "TB",
    layout: "auto",
    source: "manual",
    caption: "Figura 1 — fluxo do método",
    nodes: [
      { id: "start", label: "Início", shape: "pill" },
      { id: "read", label: "Ler o enunciado", shape: "box" },
      { id: "check", label: "Entendi o problema?", shape: "diamond" },
      { id: "solve", label: "Resolver", shape: "box" },
      { id: "end", label: "Fim", shape: "pill" },
    ],
    edges: [
      { id: "e1", from: "start", to: "read" },
      { id: "e2", from: "read", to: "check" },
      { id: "e3", from: "check", to: "solve", label: "Sim" },
      { id: "e4", from: "solve", to: "end" },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function customization() {
  return {
    template: "academic",
    colorScheme: "blue",
    fontFamily: "aptos",
    fontSize: "medium",
    spacing: "normal",
    orientation: "portrait",
    pageNumbering: "bottom-center",
    pageMargins: "normal",
    headerFooter: { enabled: false, headerText: "", footerText: "", showPageNumbers: false },
    coverPage: { enabled: false, title: "", subtitle: "", author: "", date: "" },
    tableOfContents: { enabled: false, depth: 2 },
  };
}

function documentFixture(): StudioDocument {
  return {
    id: "diagram-document",
    studyId: STUDY_ID,
    contentId: CONTENT_ID,
    type: "document",
    kind: "study-material",
    title: "Material com diagrama",
    template: "academic",
    customization: customization(),
    documentStructure: {
      id: "structure-diagram",
      title: "Material com diagrama",
      subtitle: "",
      description: "",
      metadata: { author: "Autor do teste", subject: "Métodos de estudo", keywords: ["diagrama"], createdAt: NOW, updatedAt: NOW },
      sections: [
        { id: "sec-diagram", type: "diagram", title: "Fluxo do método", level: 1, order: 0, content: "", diagram: diagramFixture() },
        { id: "sec-heading", type: "heading", title: "Introdução", level: 1, order: 1, content: "Introdução ao material." },
        { id: "sec-text", type: "paragraph", title: "Explicação", level: 2, order: 2, content: "O diagrama acima resume o método de resolução." },
      ],
    },
    version: 1,
    status: "draft",
    createdAt: NOW,
    updatedAt: NOW,
  } as StudioDocument;
}

function deckFixture(): StudioDocument {
  return {
    ...documentFixture(),
    id: "diagram-deck",
    type: "presentation",
    title: "Apresentação com diagrama",
    template: "academic-presentation",
    customization: customization(),
    documentStructure: undefined,
    slides: [
      { id: "slide-diagram", layout: "diagram", title: "Diagrama do método", content: "", order: 0, diagram: diagramFixture() },
      { id: "slide-text", layout: "title-content", title: "Detalhes", content: "Primeiro item\nSegundo item", order: 1 },
      { id: "slide-text-2", layout: "title-content", title: "Fechamento", content: "Terceiro item", order: 2 },
    ],
  } as unknown as StudioDocument;
}

function knowledgeFixture() {
  const concept = (id: string, name: string, importance: number) => ({
    id,
    name,
    normalizedName: name.toLowerCase(),
    description: `Descrição de ${name}.`,
    kind: "concept" as const,
    aliases: [],
    keywords: [],
    examples: [],
    observations: [],
    document: "Material de diagramas",
    fileId: "file-diagram",
    studyId: STUDY_ID,
    relationIds: [],
    importance,
  });
  return {
    id: "knowledge-diagram",
    version: 1 as const,
    parserVersion: "test",
    fileId: "file-diagram",
    extractedContentId: "extracted-diagram",
    studyId: STUDY_ID,
    documentName: "Material de diagramas",
    sourceHash: "hash",
    concepts: [concept("c1", "Método", 0.9), concept("c2", "Etapas", 0.7), concept("c3", "Revisão", 0.5)],
    relations: [{ id: "r1", sourceId: "c1", targetId: "c2", kind: "depends_on" as const, evidence: "evidência", weight: 1 }],
    blocks: [],
    chunks: [],
    statistics: { conceptCount: 3, relationCount: 1, chapterCount: 0, semanticChunkCount: 0, structureDegree: 1, isolatedConceptCount: 0 },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function seedApp(
  page: Page,
  options: { document: StudioDocument; knowledge?: boolean },
): Promise<void> {
  await page.goto("/storage");
  await expect(page.getByText("studyai-db", { exact: true })).toBeVisible();
  await page.evaluate(
    async (payload) => {
      const scope = localStorage.getItem("studyai:storage-scope") || "guest";
      const databaseName = scope === "guest" ? "studyai-db" : `studyai-db:${scope}`;
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 5);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
          const database = request.result;
          for (const store of ["academy", "studio-documents", "knowledge"]) {
            if (!database.objectStoreNames.contains(store)) database.createObjectStore(store, { keyPath: "id" });
          }
        };
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(["academy", "studio-documents", "knowledge"], "readwrite");
          transaction.objectStore("academy").put(payload.study);
          transaction.objectStore("studio-documents").put(payload.document);
          if (payload.knowledge) transaction.objectStore("knowledge").put(payload.knowledge);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    },
    { study: studyFixture(), document: options.document, knowledge: options.knowledge ? knowledgeFixture() : null },
  );
}

async function openStudio(page: Page, type: StudioDocumentType = "document") {
  const url = `/academy/studio?estudo=${encodeURIComponent(STUDY_ID)}&conteudo=${encodeURIComponent(CONTENT_ID)}&tipo=${type}`;
  await page.goto(url);
  await expect(page.locator('section[aria-label="Editor"]')).toBeVisible();
}

function sidebar(page: Page) {
  return page.locator('aside[aria-label="Painel do Studio"]');
}

async function openDiagramsTab(page: Page) {
  await sidebar(page).getByRole("tab", { name: "Diagramas" }).click();
  await expect(sidebar(page).getByText("A fonte (nós e conexões) fica salva no documento")).toBeVisible();
}

async function currentDocument(page: Page, type: StudioDocumentType = "document"): Promise<StudioDocument | undefined> {
  const documents = await readIndexedDBStore<StudioDocument>(page, "studio-documents");
  return documents.find((document) => document.studyId === STUDY_ID && document.type === type);
}

async function diagramFromStore(page: Page, type: StudioDocumentType = "document"): Promise<DiagramDocument | undefined> {
  const document = await currentDocument(page, type);
  if (!document) return undefined;
  if (type === "presentation") return document.slides?.[0]?.diagram;
  return document.documentStructure?.sections.find((section) => section.id === "sec-diagram")?.diagram;
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const path = await download.path();
  if (!path) throw new Error("O download não produziu arquivo.");
  const { readFile } = await import("node:fs/promises");
  return readFile(path);
}

async function exportWith(page: Page, label: "Exportar PDF" | "Exportar PowerPoint"): Promise<Download> {
  const panel = sidebar(page);
  await panel.getByRole("tab", { name: "Exportar" }).click();
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: label }).click();
  return download;
}

async function pdfPageTexts(bytes: Buffer): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let index = 1; index <= document.numPages; index += 1) {
    const page = await document.getPage(index);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return pages;
}

function pngSize(bytes: Buffer) {
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

// ---------------------------------------------------------------------------
// Núcleo determinístico (roda em Node, sem IA real)
// ---------------------------------------------------------------------------

test("layout é determinístico e mantém os nós dentro dos limites nos 8 tipos", () => {
  expect(diagramTypes).toHaveLength(8);
  for (const type of diagramTypes) {
    const diagram = createDiagramFromTemplate(type);
    const first = layoutDiagram(diagram);
    const second = layoutDiagram(diagram);
    expect(second).toEqual(first);
    expect(first.nodes).toHaveLength(diagram.nodes.length);
    for (const node of first.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x + node.width).toBeLessThanOrEqual(first.width);
      expect(node.y + node.height).toBeLessThanOrEqual(first.height);
      expect(node.lines.length).toBeGreaterThan(0);
    }
  }
});

test("normalização aplica limites de nós, conexões e textos", () => {
  const nodes = Array.from({ length: 60 }, (_, index) => ({ id: `n${index}`, label: `Nó ${index}` }));
  const edges = Array.from({ length: 120 }, (_, index) => ({ id: `e${index}`, from: "n0", to: "n1" }));
  const normalized = normalizeDiagram({
    title: "t".repeat(500),
    caption: "c".repeat(500),
    nodes,
    edges,
    type: "flowchart",
  });
  expect(normalized.nodes).toHaveLength(DIAGRAM_LIMITS.maxNodes);
  expect(normalized.edges).toHaveLength(DIAGRAM_LIMITS.maxEdges);
  expect(normalized.title.length).toBe(DIAGRAM_LIMITS.maxTitleLength);
  expect(normalized.caption?.length).toBe(DIAGRAM_LIMITS.maxCaptionLength);
});

test("normalização remove conexões órfãs, laços e rótulos longos", () => {
  const normalized = normalizeDiagram({
    nodes: [
      { id: "a", label: "x".repeat(300) },
      { id: "b", label: "B" },
      { id: "a", label: "Duplicado" },
      { id: "c", label: "   " },
    ],
    edges: [
      { id: "e1", from: "a", to: "b" },
      { id: "e2", from: "a", to: "fantasma" },
      { id: "e3", from: "b", to: "b" },
      { id: "e1", from: "b", to: "a" },
    ],
  });
  expect(normalized.nodes.map((node) => node.id)).toEqual(["a", "b", "a-2"]);
  expect(normalized.nodes[0].label.length).toBe(DIAGRAM_LIMITS.maxLabelLength);
  expect(normalized.edges).toHaveLength(1);
  expect(normalized.edges[0].id).toBe("e1");
});

test("SVG gerado é válido, acessível e livre de conteúdo executável", () => {
  const diagram = createDiagramFromTemplate("flowchart");
  const { svg, width, height } = renderDiagramSvg(diagram);
  expect(validateSvgMarkup(svg)).toEqual([]);
  expect(svg.startsWith("<svg")).toBe(true);
  expect(svg.endsWith("</svg>")).toBe(true);
  expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`);
  expect(svg).toContain("<title");
  expect(svg).toContain("<desc");
  expect(svg).toContain('role="img"');
  expect(svg).not.toContain("<foreignObject");
});

test("rótulos hostis são escapados e não viram marcação", () => {
  const diagram = normalizeDiagram({
    title: "Segurança",
    nodes: [
      { id: "a", label: '<script>alert("x")</script>' },
      { id: "b", label: '<image href="http://evil.test/x.svg">' },
    ],
    edges: [{ id: "e1", from: "a", to: "b" }],
  });
  const { svg } = renderDiagramSvg(diagram);
  expect(svg).not.toContain("<script");
  expect(svg).not.toContain("<image");
  expect(svg).toContain("&lt;script&gt;");
  expect(svg).not.toContain('href="http');
  expect(validateSvgMarkup(svg)).toEqual([]);
});

test("legenda opcional altera a altura do SVG e o fundo pode ser transparente", () => {
  const diagram = createDiagramFromTemplate("process");
  const withCaption = renderDiagramSvg(diagram, { caption: "Figura de teste" });
  const withoutCaption = renderDiagramSvg(diagram, { caption: "" });
  expect(withCaption.height).toBeGreaterThan(withoutCaption.height);
  expect(withCaption.svg).toContain("Figura de teste");
  const transparent = renderDiagramSvg(diagram, { background: false });
  expect(transparent.svg).not.toContain(`<rect x="0" y="0" width="${transparent.width}"`);
});

test("Mermaid: subconjunto é interpretado com rótulos, formas e estilos", () => {
  const source = [
    "flowchart TD",
    "  A[Início] --> B{Decisão}",
    "  B -->|Sim| C[Fim]",
    "  B -.-> D[Revisar]",
  ].join("\n");
  const result = parseMermaid(source);
  expect(result.ok).toBe(true);
  expect(result.issues).toEqual([]);
  const diagram = result.diagram!;
  expect(diagram.nodes.map((node) => node.label)).toEqual(["Início", "Decisão", "Fim", "Revisar"]);
  expect(diagram.nodes[1].shape).toBe("diamond");
  expect(diagram.edges).toHaveLength(3);
  expect(diagram.edges[1].label).toBe("Sim");
  expect(diagram.edges[2].style).toBe("dashed");
});

test("Mermaid: sintaxe inválida retorna erro legível sem lançar exceção", () => {
  expect(parseMermaid("").ok).toBe(false);
  expect(parseMermaid("flowchart TD\n  subgraph Grupo").ok).toBe(false);
  expect(parseMermaid("A --> B").issues[0]).toContain("Cabeçalho");
  expect(parseMermaid("flowchart XX\n  A --> B").ok).toBe(false);
});

test("Mermaid: a fonte editável faz ida e volta a partir do modelo", () => {
  const original = createDiagramFromTemplate("flowchart");
  const source = toMermaidSource(original);
  expect(source.startsWith("flowchart TB")).toBe(true);
  const parsed = parseMermaid(source);
  expect(parsed.ok).toBe(true);
  expect(parsed.diagram!.nodes.map((node) => node.label).sort()).toEqual(
    original.nodes.map((node) => node.label).sort(),
  );
  expect(parsed.diagram!.edges).toHaveLength(original.edges.length);
});

test("proposta de IA aceita apenas JSON estruturado e recusa marcação", () => {
  const valid = parseDiagramProposal(
    '```json\n{"title":"Mapa","nodes":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"edges":[{"from":"a","to":"b","label":"leva a"}]}\n```',
  );
  expect(valid.ok).toBe(true);
  expect(valid.diagram!.nodes).toHaveLength(2);
  expect(valid.diagram!.edges[0].label).toBe("leva a");

  expect(parseDiagramProposal('<svg onload="alert(1)"><script>alert(1)</script></svg>').ok).toBe(false);
  expect(parseDiagramProposal("sem json").ok).toBe(false);
  expect(parseDiagramProposal('{"nodes":[]}').ok).toBe(false);

  const leak = parseDiagramProposal(
    '{"title":"Chave","nodes":[{"id":"a","label":"sk-proj-abcdefghijklmnopqrstuvwxyz123456"}],"edges":[]}',
  );
  expect(leak.ok).toBe(true);
  expect(leak.diagram!.nodes[0].label).not.toContain("sk-proj-");
  expect(leak.diagram!.nodes[0].label).toBe("[credencial removida]");
});

// ---------------------------------------------------------------------------
// Interface do Diagram Studio
// ---------------------------------------------------------------------------

test("aba Diagramas exibe o diagrama da seção e persiste a edição do título", async ({ page }) => {
  await seedApp(page, { document: documentFixture() });
  await openStudio(page);
  await openDiagramsTab(page);

  const panel = sidebar(page);
  await expect(panel.getByRole("img", { name: /Diagrama editável/ })).toBeVisible();
  await expect(panel.getByLabel("Título do diagrama")).toHaveValue("Fluxo do método");

  await panel.getByLabel("Título do diagrama").fill("Fluxo revisado");
  await expect
    .poll(async () => (await diagramFromStore(page))?.title)
    .toBe("Fluxo revisado");

  await page.reload();
  await openDiagramsTab(page);
  await expect(sidebar(page).getByLabel("Título do diagrama")).toHaveValue("Fluxo revisado");
});

test("arrastar um nó grava posição manual e reorganizar volta ao layout automático", async ({ page }) => {
  await seedApp(page, { document: documentFixture() });
  await openStudio(page);
  await openDiagramsTab(page);

  const panel = sidebar(page);
  const node = panel.locator('g[aria-label^="Nó Início"]');
  await expect(node).toBeVisible();
  const box = await node.boundingBox();
  if (!box) throw new Error("Nó sem caixa delimitadora.");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 48, box.y + box.height / 2 + 36, { steps: 10 });
  await page.mouse.up();

  await expect.poll(async () => (await diagramFromStore(page))?.layout).toBe("manual");
  const moved = await diagramFromStore(page);
  expect(moved?.nodes[0].position?.x).toBeGreaterThan(0);

  await panel.getByRole("button", { name: "Reorganizar" }).click();
  await expect.poll(async () => (await diagramFromStore(page))?.layout).toBe("auto");
  const reset = await diagramFromStore(page);
  expect(reset?.nodes[0].position).toBeUndefined();
});

test("editar rótulo atualiza a prévia e a fonte continua editável", async ({ page }) => {
  await seedApp(page, { document: documentFixture() });
  await openStudio(page);
  await openDiagramsTab(page);

  const panel = sidebar(page);
  await panel.getByLabel("Rótulo do nó Início").fill("Começo");
  const preview = page.locator('section[aria-label="Pré-visualização"]');
  await expect(preview.getByText("Começo")).toBeVisible({ timeout: 10_000 });

  await expect.poll(async () => (await diagramFromStore(page))?.nodes[0].label).toBe("Começo");
});

test("alterar o tipo do diagrama reorganiza o desenho e persiste", async ({ page }) => {
  await seedApp(page, { document: documentFixture() });
  await openStudio(page);
  await openDiagramsTab(page);

  const panel = sidebar(page);
  const before = await diagramFromStore(page);
  const beforeLayout = layoutDiagram(before!);

  await panel.getByLabel("Tipo do diagrama").selectOption("mindmap");
  await expect.poll(async () => (await diagramFromStore(page))?.type).toBe("mindmap");

  const after = await diagramFromStore(page);
  expect(after?.nodes).toHaveLength(before!.nodes.length);
  const afterLayout = layoutDiagram(after!);
  expect(afterLayout.nodes.map((node) => `${node.x},${node.y}`)).not.toEqual(
    beforeLayout.nodes.map((node) => `${node.x},${node.y}`),
  );
});

test("download do SVG entrega arquivo vetorial validado", async ({ page }) => {
  await seedApp(page, { document: documentFixture() });
  await openStudio(page);
  await openDiagramsTab(page);

  const download = page.waitForEvent("download");
  await sidebar(page).getByRole("button", { name: "SVG", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("fluxo-do-metodo-diagrama.svg");
  expect((await downloadBytes(file)).toString("utf8")).toBeTruthy();

  const content = (await downloadBytes(file)).toString("utf8");
  expect(validateSvgMarkup(content)).toEqual([]);
  expect(content).toContain("<svg");
  expect(content).toContain("Entendi o problema?");
});

test("download do PNG usa a resolução escolhida e respeita fundo transparente", async ({ page }) => {
  await seedApp(page, { document: documentFixture() });
  await openStudio(page);
  await openDiagramsTab(page);

  const panel = sidebar(page);
  const expected = renderDiagramSvg(diagramFixture());

  const firstDownload = page.waitForEvent("download");
  await panel.getByRole("button", { name: "PNG", exact: true }).click();
  const opaque = await downloadBytes(await firstDownload);
  expect(opaque.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(pngSize(opaque)).toEqual({ width: Math.round(expected.width * 2), height: Math.round(expected.height * 2) });

  const opaqueAlpha = await page.evaluate(async (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, 1, 1).data[3];
  }, opaque.toString("base64"));
  expect(opaqueAlpha).toBe(255);

  await panel.getByRole("checkbox", { name: "Fundo transparente" }).check();
  await panel.getByLabel("Resolução do PNG").selectOption("1");
  const secondDownload = page.waitForEvent("download");
  await panel.getByRole("button", { name: "PNG", exact: true }).click();
  const transparent = await downloadBytes(await secondDownload);
  expect(pngSize(transparent)).toEqual({ width: Math.round(expected.width), height: Math.round(expected.height) });

  const transparentAlpha = await page.evaluate(async (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, 1, 1).data[3];
  }, transparent.toString("base64"));
  expect(transparentAlpha).toBe(0);
});

test("salvar o diagrama na Biblioteca cria material vinculado ao Studio", async ({ page }) => {
  await seedApp(page, { document: documentFixture() });
  await openStudio(page);
  await openDiagramsTab(page);

  const panel = sidebar(page);
  await panel.getByRole("button", { name: "Salvar na Biblioteca" }).click();
  await expect(panel.getByText("PNG salvo na Biblioteca")).toBeVisible({ timeout: 20_000 });

  await page.goto("/biblioteca");
  await expect(page.getByRole("heading", { name: "fluxo-do-metodo-diagrama.png" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Diagrama Gerado").first()).toBeVisible();

  const open = page.getByRole("link", { name: "Abrir material" }).first();
  await expect(open).toBeVisible();
  await expect(open).toHaveAttribute("href", `/estudo?tema=${STUDY_ID}&arquivo=studio-diagram-diagram-fixture&aba=material`);
  await expect(page.getByRole("link", { name: "Reabrir no Studio" }).first()).toBeVisible();

  await open.click();
  await expect(page.getByText("Nenhum estudo disponível")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "fluxo-do-metodo-diagrama.png" }).first()).toBeVisible({ timeout: 15_000 });
});

test("PDF exporta o diagrama como vetor com legenda e preserva a fonte editável", async ({ page }) => {
  await seedApp(page, { document: documentFixture() });
  await openStudio(page);

  const download = await exportWith(page, "Exportar PDF");
  expect(download.suggestedFilename()).toMatch(/-studio\.pdf$/);
  const bytes = await downloadBytes(download);
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);

  const text = extractPdfText(bytes);
  expect(text).toContain("Início");
  expect(text).toContain("Entendi o problema?");
  expect(text).toContain("Resolver");
  expect(text).toContain("Figura 1 - fluxo do método");
  expect(text).not.toContain("flowchart TB");
  expect(text).not.toContain("fonte editável");

  const pages = await pdfPageTexts(bytes);
  expect(pages[0]).toContain("Fluxo do método");
  expect(pages[0]).toContain("Entendi o problema?");
  const emptyPages = pages.filter(
    (page) => page.replace(/Diagram Studio - StudyAI|StudyAI Academy|\d+/g, "").trim().length === 0,
  );
  expect(emptyPages).toEqual([]);

  const stored = await diagramFromStore(page);
  expect(stored?.nodes).toHaveLength(5);
  expect(stored?.edges).toHaveLength(4);
});

test("PPTX usa formas e conectores nativos, sem imagens e dentro do slide", async ({ page }) => {
  await seedApp(page, { document: deckFixture() });
  await openStudio(page, "presentation");

  const download = await exportWith(page, "Exportar PowerPoint");
  expect(download.suggestedFilename()).toMatch(/-studio\.pptx$/);
  const archive = await JSZip.loadAsync(await downloadBytes(download));
  const slide = await archive.file("ppt/slides/slide1.xml")!.async("string");

  expect(slide).toContain("<p:cxnSp>");
  expect(slide).toContain('prst="diamond"');
  expect(slide).toContain("<a:t>Início</a:t>");
  expect(slide).toContain("<a:t>Entendi o problema?</a:t>");
  expect(slide).toContain("Figura 1 — fluxo do método");
  expect(slide).not.toContain("<p:pic>");
  expect(slide).not.toContain("<p:blipFill>");

  const positions = [...slide.matchAll(/<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)];
  expect(positions.length).toBeGreaterThan(5);
  for (const match of positions) {
    const [x, y, cx, cy] = match.slice(1).map(Number);
    expect(x + cx).toBeLessThanOrEqual(12_192_000);
    expect(y + cy).toBeLessThanOrEqual(6_858_000);
  }
});

test("gerar com IA exige confirmação antes de substituir o diagrama", async ({ page }) => {
  const proposal: DiagramDocument = {
    ...diagramFixture(),
    id: "ai-proposal",
    title: "Mapa gerado pela IA",
    type: "mindmap",
    source: "ai",
    nodes: [
      { id: "a", label: "Causa", shape: "rounded" },
      { id: "b", label: "Efeito", shape: "rounded" },
    ],
    edges: [{ id: "e1", from: "a", to: "b" }],
    caption: undefined,
  };
  await page.route("**/api/diagrams/generate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ proposal, explanation: "Proposta de teste.", type: "mindmap" }),
    });
  });

  await seedApp(page, { document: documentFixture() });
  await openStudio(page);
  await openDiagramsTab(page);

  const panel = sidebar(page);
  await panel.getByLabel("Tema do diagrama para a IA").fill("Causa e efeito");
  await panel.getByRole("button", { name: "Gerar proposta" }).click();

  await expect(panel.getByText("Proposta: Mapa gerado pela IA")).toBeVisible({ timeout: 10_000 });
  expect((await diagramFromStore(page))?.title).toBe("Fluxo do método");

  await panel.getByRole("button", { name: "Aplicar proposta" }).click();
  await expect.poll(async () => (await diagramFromStore(page))?.title).toBe("Mapa gerado pela IA");
  const applied = await diagramFromStore(page);
  expect(applied?.nodes.map((node) => node.label)).toEqual(["Causa", "Efeito"]);
});

test("conteúdo hostil vindo da IA é renderizado como texto, nunca executado", async ({ page }) => {
  const proposal: DiagramDocument = {
    ...diagramFixture(),
    id: "ai-hostile",
    title: "Proposta suspeita",
    source: "ai",
    nodes: [
      { id: "a", label: '<script>window.__diagramXss = true</script>' },
      { id: "b", label: "Destino" },
    ],
    edges: [{ id: "e1", from: "a", to: "b" }],
    caption: undefined,
  };
  await page.route("**/api/diagrams/generate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ proposal, explanation: "Proposta hostil.", type: "flowchart" }),
    });
  });

  await seedApp(page, { document: documentFixture() });
  await openStudio(page);
  await openDiagramsTab(page);

  const panel = sidebar(page);
  await panel.getByLabel("Tema do diagrama para a IA").fill("Teste hostil");
  await panel.getByRole("button", { name: "Gerar proposta" }).click();
  await panel.getByRole("button", { name: "Aplicar proposta" }).click();

  await expect.poll(async () => (await diagramFromStore(page))?.title).toBe("Proposta suspeita");
  const executed = await page.evaluate(() => (window as unknown as { __diagramXss?: boolean }).__diagramXss === true);
  expect(executed).toBe(false);
  expect(await page.locator('script:has-text("__diagramXss")').count()).toBe(0);
  const texts = await panel.getByRole("img", { name: /Diagrama editável/ }).textContent();
  expect(texts).toContain("<script>");
  expect(texts).toContain("window.__diagramXss");
  expect(texts).toContain("Destino");
});

test("importar Mermaid inválido mostra erro e não altera o diagrama", async ({ page }) => {
  await seedApp(page, { document: documentFixture() });
  await openStudio(page);
  await openDiagramsTab(page);

  const panel = sidebar(page);
  await panel.getByRole("button", { name: "Colar Mermaid" }).click();
  await panel.getByLabel("Código Mermaid").fill("isto não é mermaid");
  await panel.getByRole("button", { name: "Importar Mermaid" }).click();
  await expect(panel.getByRole("alert")).toContainText("Cabeçalho ausente");
  expect((await diagramFromStore(page))?.nodes).toHaveLength(5);
});

test("importar Mermaid válido substitui nós e conexões mantendo a fonte editável", async ({ page }) => {
  await seedApp(page, { document: documentFixture() });
  await openStudio(page);
  await openDiagramsTab(page);

  const panel = sidebar(page);
  await panel.getByRole("button", { name: "Colar Mermaid" }).click();
  await panel.getByLabel("Código Mermaid").fill("flowchart LR\n  A[Entrada] --> B[Saída]");
  await panel.getByRole("button", { name: "Importar Mermaid" }).click();

  await expect(panel.getByRole("status")).toContainText("Mermaid importado");
  await expect.poll(async () => (await diagramFromStore(page))?.nodes.length).toBe(2);
  const stored = await diagramFromStore(page);
  expect(stored?.nodes.map((node) => node.label)).toEqual(["Entrada", "Saída"]);
  expect(stored?.direction).toBe("LR");
  expect(stored?.title).toBe("Fluxo do método");
});

test("importar do Knowledge Graph cria um mapa conceitual editável", async ({ page }) => {
  await seedApp(page, { document: documentFixture(), knowledge: true });
  await openStudio(page);
  await openDiagramsTab(page);

  const panel = sidebar(page);
  await panel.getByRole("button", { name: "Knowledge Graph" }).click();
  await expect(panel.getByRole("status")).toContainText("Mapa conceitual importado", { timeout: 15_000 });

  await expect.poll(async () => (await diagramFromStore(page))?.source).toBe("knowledge");
  const stored = await diagramFromStore(page);
  expect(stored?.type).toBe("concept-map");
  expect(stored?.nodes.map((node) => node.label)).toEqual(["Método", "Etapas", "Revisão"]);
  expect(stored?.edges[0].label).toBe("depends on");
});

test("falha ao rasterizar mostra erro acionável e o SVG continua funcionando", async ({ page }) => {
  await seedApp(page, { document: documentFixture() });
  await openStudio(page);
  await openDiagramsTab(page);

  await page.evaluate(() => {
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback: BlobCallback) {
      callback(null);
    };
  });

  const panel = sidebar(page);
  await panel.getByRole("button", { name: "PNG", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Não foi possível gerar o PNG");

  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "SVG", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("fluxo-do-metodo-diagrama.svg");
});

test("diagrama em branco pede um template em vez de renderizar lixo", async ({ page }) => {
  const empty = documentFixture();
  empty.documentStructure!.sections[0] = {
    ...empty.documentStructure!.sections[0],
    diagram: undefined,
  };
  await seedApp(page, { document: empty });
  await openStudio(page);
  await openDiagramsTab(page);

  const panel = sidebar(page);
  await expect(panel.getByText("Começar a partir de um template")).toBeVisible();
  await panel.getByRole("button", { name: "Mapa mental" }).click();
  await expect(panel.getByRole("img", { name: /Diagrama editável/ })).toBeVisible();
  await expect.poll(async () => (await diagramFromStore(page))?.type).toBe("mindmap");
});

test.describe("layout móvel", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("o Diagram Studio é utilizável no celular sem estouro horizontal", async ({ page }) => {
    await seedApp(page, { document: documentFixture() });
    await openStudio(page);

    await page.getByRole("tab", { name: "Organizar" }).click();
    await openDiagramsTab(page);

    const canvas = sidebar(page).getByRole("img", { name: /Diagrama editável/ });
    await expect(canvas).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await expect(sidebar(page).getByLabel("Título do diagrama")).toBeVisible();
  });
});
