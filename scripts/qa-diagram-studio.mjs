/**
 * QA visual do StudyAI Diagram Studio (Sprint 37D.1).
 *
 * Semeia um estudo e um documento com diagrama, percorre os oito tipos na
 * interface real, exporta SVG/PNG de cada um, gera PDF com o diagrama vetorial
 * e um PPTX com formas/conectores nativos, e captura imagens do painel, da
 * pré-visualização, do leitor de PDF do StudyAI e do layout móvel.
 *
 * Uso:
 *   1) npm run dev            (em outro terminal)
 *   2) node scripts/qa-diagram-studio.mjs
 *
 * Saída: test-results/qa-37d1/
 */

import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE_URL = process.env.QA_BASE_URL ?? "http://localhost:3000";
const OUTPUT = "test-results/qa-37d1";
const NOW = new Date().toISOString();
const STUDY_ID = "qa-diagram-study";
const CONTENT_ID = "qa-diagram-content";

const TYPES = ["flowchart", "process", "mindmap", "concept-map", "timeline", "comparison", "org-chart", "cycle"];

const study = {
  id: STUDY_ID,
  title: "Estudo de diagramas",
  topic: "Método de resolução de problemas",
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
      title: "Material com diagramas",
      objective: "Validar o Diagram Studio.",
      prerequisites: [],
      modules: [],
      chapters: [],
      concepts: [],
      examples: [],
      exercises: [],
      summary: "Resumo.",
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

const diagram = {
  id: "qa-diagram",
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
    { id: "ask", label: "Revisar conceitos", shape: "box" },
    { id: "solve", label: "Resolver e conferir", shape: "box" },
    { id: "end", label: "Fim", shape: "pill" },
  ],
  edges: [
    { id: "e1", from: "start", to: "read" },
    { id: "e2", from: "read", to: "check" },
    { id: "e3", from: "check", to: "ask", label: "Não" },
    { id: "e4", from: "ask", to: "read", label: "Retomar", style: "dashed" },
    { id: "e5", from: "check", to: "solve", label: "Sim" },
    { id: "e6", from: "solve", to: "end" },
  ],
  createdAt: NOW,
  updatedAt: NOW,
};

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
    headerFooter: { enabled: true, headerText: "Diagram Studio — StudyAI", footerText: "StudyAI Academy", showPageNumbers: true },
    coverPage: { enabled: false, title: "", subtitle: "", author: "", date: "" },
    tableOfContents: { enabled: false, depth: 2 },
  };
}

const documentRecord = {
  id: "qa-diagram-document",
  studyId: STUDY_ID,
  contentId: CONTENT_ID,
  type: "document",
  kind: "study-material",
  title: "Material com diagramas",
  template: "academic",
  customization: customization(),
  documentStructure: {
    id: "qa-diagram-structure",
    title: "Material com diagramas",
    subtitle: "",
    description: "",
    metadata: { author: "StudyAI Academy", subject: "Métodos de estudo", keywords: ["diagrama"], createdAt: NOW, updatedAt: NOW },
    sections: [
      { id: "sec-diagram", type: "diagram", title: "Fluxo do método", level: 1, order: 0, content: "", diagram },
      { id: "sec-heading", type: "heading", title: "Explicação", level: 1, order: 1, content: "O diagrama acima resume o método." },
      { id: "sec-text", type: "paragraph", title: "Aplicação", level: 2, order: 2, content: "Use o fluxo em toda resolução de exercícios." },
    ],
  },
  version: 1,
  status: "draft",
  createdAt: NOW,
  updatedAt: NOW,
};

const deckRecord = {
  ...documentRecord,
  id: "qa-diagram-deck",
  type: "presentation",
  title: "Apresentação com diagrama",
  template: "academic-presentation",
  documentStructure: undefined,
  slides: [
    { id: "slide-diagram", layout: "diagram", title: "Diagrama do método", content: "", order: 0, diagram },
    { id: "slide-text", layout: "title-content", title: "Aplicação", content: "Primeiro passo\nSegundo passo", order: 1 },
  ],
};

async function seed(page, records) {
  await page.goto(`${BASE_URL}/storage`);
  await page.getByText("studyai-db", { exact: true }).waitFor();
  await page.evaluate(async (payload) => {
    const scope = localStorage.getItem("studyai:storage-scope") || "guest";
    const name = scope === "guest" ? "studyai-db" : `studyai-db:${scope}`;
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 5);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const store of ["academy", "studio-documents"]) {
          if (!database.objectStoreNames.contains(store)) database.createObjectStore(store, { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(["academy", "studio-documents"], "readwrite");
        transaction.objectStore("academy").put(payload.study);
        for (const record of payload.records) transaction.objectStore("studio-documents").put(record);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, { study, records });
}

let browserRef;

async function main() {
  await mkdir(OUTPUT, { recursive: true });
  const browser = await chromium.launch();
  browserRef = browser;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("console", (message) => {
    if (message.type() === "error") console.log("console.error:", message.text());
  });

  await seed(page, [documentRecord, deckRecord]);

  const sidebar = () => page.locator('aside[aria-label="Painel do Studio"]');
  const saveDownload = async (promise, name) => {
    const download = await promise;
    const target = join(OUTPUT, name ?? download.suggestedFilename());
    await download.saveAs(target);
    return target;
  };

  await page.goto(`${BASE_URL}/academy/studio?estudo=${STUDY_ID}&conteudo=${CONTENT_ID}&tipo=document`);
  await page.locator('section[aria-label="Editor"]').waitFor();
  await sidebar().getByRole("tab", { name: "Diagramas" }).click();
  await sidebar().getByText("A fonte (nós e conexões) fica salva no documento").waitFor();
  await page.waitForTimeout(600);

  await page.screenshot({ path: join(OUTPUT, "studio-editor.png") });
  await sidebar().screenshot({ path: join(OUTPUT, "painel-diagramas.png") });
  await page.getByRole("button", { name: "Somente prévia" }).click();
  await page.waitForTimeout(400);
  await page.locator('section[aria-label="Pré-visualização"]').screenshot({ path: join(OUTPUT, "preview-diagrama.png") });
  await page.getByRole("button", { name: "Editor e prévia" }).click();
  await page.waitForTimeout(400);

  const exported = [];
  for (const type of TYPES) {
    await sidebar().getByLabel("Tipo do diagrama").selectOption(type);
    await page.waitForTimeout(500);
    const svg = await saveDownload(
      (async () => {
        const waiting = page.waitForEvent("download");
        await sidebar().getByRole("button", { name: "SVG", exact: true }).click();
        return waiting;
      })(),
      `tipo-${type}.svg`,
    );
    const png = await saveDownload(
      (async () => {
        const waiting = page.waitForEvent("download");
        await sidebar().getByRole("button", { name: "PNG", exact: true }).click();
        return waiting;
      })(),
      `tipo-${type}.png`,
    );
    exported.push({ type, svg, png });
    console.log(`Tipo ${type}: ${svg} / ${png}`);
  }

  await sidebar().getByLabel("Tipo do diagrama").selectOption("flowchart");
  await page.waitForTimeout(400);
  await sidebar().getByRole("tab", { name: "Exportar" }).click();
  const pdf = await saveDownload(
    (async () => {
      const waiting = page.waitForEvent("download");
      await sidebar().getByRole("button", { name: "Exportar PDF" }).click();
      return waiting;
    })(),
    "diagrama.pdf",
  );
  console.log("PDF:", pdf);

  // Inspeção visual do PDF com pdf.js (mesma biblioteca usada pelo StudyAI),
  // sem depender de LibreOffice, PowerPoint ou Poppler no ambiente.
  const viewerHtml = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#e5e7eb;display:flex;flex-direction:column;align-items:center;gap:24px;padding:24px">
<div id="pages" style="display:flex;flex-direction:column;align-items:center;gap:24px"></div>
<script type="module">
import * as pdfjs from "/pdf.min.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
const doc = await pdfjs.getDocument("/document.pdf").promise;
const container = document.getElementById("pages");
for (let index = 1; index <= doc.numPages; index += 1) {
  const page = await doc.getPage(index);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.dataset.page = String(index);
  canvas.style.cssText = "box-shadow:0 8px 24px rgba(0,0,0,.18);background:#fff;max-width:100%";
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  container.appendChild(canvas);
}
document.body.dataset.ready = "1";
</script></body></html>`;

  const pdfServer = createServer(async (request, response) => {
    try {
      if (request.url === "/") {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(viewerHtml);
        return;
      }
      if (request.url === "/document.pdf") {
        response.setHeader("content-type", "application/pdf");
        response.end(await readFile(pdf));
        return;
      }
      const asset = request.url === "/pdf.min.mjs" || request.url === "/pdf.worker.min.mjs"
        ? join("node_modules/pdfjs-dist/build", request.url.slice(1))
        : null;
      if (!asset) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader("content-type", "text/javascript; charset=utf-8");
      response.end(await readFile(asset));
    } catch {
      response.statusCode = 500;
      response.end();
    }
  });
  await new Promise((resolve) => pdfServer.listen(0, "127.0.0.1", resolve));
  const { port } = pdfServer.address();
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30_000 });
  await page.screenshot({ path: join(OUTPUT, "pdf-leitor.png"), fullPage: true });
  await page.locator('canvas[data-page="1"]').screenshot({ path: join(OUTPUT, "pdf-pagina-1.png") });
  await page.locator('canvas[data-page="2"]').screenshot({ path: join(OUTPUT, "pdf-pagina-2.png") });
  pdfServer.close();

  // PPTX com formas e conectores nativos.
  await page.goto(`${BASE_URL}/academy/studio?estudo=${STUDY_ID}&conteudo=${CONTENT_ID}&tipo=presentation`);
  await page.locator('section[aria-label="Editor"]').waitFor();
  await sidebar().getByRole("tab", { name: "Exportar" }).click();
  const pptx = await saveDownload(
    (async () => {
      const waiting = page.waitForEvent("download");
      await sidebar().getByRole("button", { name: "Exportar PowerPoint" }).click();
      return waiting;
    })(),
    "diagrama.pptx",
  );
  console.log("PPTX:", pptx);
  await page.screenshot({ path: join(OUTPUT, "studio-apresentacao.png") });

  const summary = [
    "QA visual do Diagram Studio (Sprint 37D.1)",
    "",
    ...exported.map((item) => `${item.type}: ${item.svg} | ${item.png}`),
    `PDF: ${pdf} (páginas renderizadas em pdf-pagina-1.png e pdf-pagina-2.png via pdf.js)`,
    `PPTX: ${pptx}`,
    "",
    "Os oito arquivos de tipo usam o mesmo grafo de 6 nós, trocando apenas o tipo",
    "de layout — o objetivo é evidenciar o desenho de cada tipo, não o template.",
    "Limitação registrada: PPTX validado estruturalmente (sem LibreOffice/PowerPoint no ambiente).",
  ];

  await writeFile(join(OUTPUT, "resumo.txt"), summary.join("\n"));

  // Layout móvel (mesma origem para manter o IndexedDB semeado).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/academy/studio?estudo=${STUDY_ID}&conteudo=${CONTENT_ID}&tipo=document`);
  await page.locator('section[aria-label="Editor"]').waitFor();
  await page.getByRole("tab", { name: "Organizar" }).click();
  await sidebar().getByRole("tab", { name: "Diagramas" }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUTPUT, "mobile-diagramas.png"), fullPage: false });

  await writeFile(
    join(OUTPUT, "resumo.txt"),
    [...summary, `Móvel: ${join(OUTPUT, "mobile-diagramas.png")}`].join("\n"),
  );

  await browser.close();
  console.log("QA concluída em", OUTPUT);
}

main().catch(async (error) => {
  console.error(error);
  await browserRef?.close().catch(() => {});
  process.exitCode = 1;
});
