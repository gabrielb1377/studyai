import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { createTextPdf, TEXT_PDF } from "./helpers/pdf-file";
import { readIndexedDBStore } from "./helpers/indexed-db";
import type { ExtractedContent } from "../src/features/extraction/ExtractionTypes";
import { enableAdvancedMode } from "./helpers/experience";

test.beforeEach(async ({ page }) => enableAdvancedMode(page));

async function createOoxmlFixture(path: string, text: string) {
  const archive = new JSZip();
  archive.file(
    path,
    `<?xml version="1.0" encoding="UTF-8"?><root><t>${text}</t></root>`,
  );
  return archive.generateAsync({ type: "nodebuffer" });
}

function createScannedPdf(image: Buffer, width: number, height: number) {
  const content = Buffer.from(`q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`);
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
      "/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
    ),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`,
      ),
      image,
      Buffer.from("\nendstream"),
    ]),
    Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`),
      content,
      Buffer.from("\nendstream"),
    ]),
  ];
  const parts = [Buffer.from("%PDF-1.4\n")];
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(parts.reduce((total, part) => total + part.length, 0));
    parts.push(Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from("\nendobj\n"));
  }
  const xrefOffset = parts.reduce((total, part) => total + part.length, 0);
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join("");
  return Buffer.concat([...parts, Buffer.from(xref)]);
}

function createWavFixture(duration = 1, sampleRate = 16_000) {
  const sampleCount = Math.floor(duration * sampleRate);
  const dataLength = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataLength);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataLength, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataLength, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.sin(2 * Math.PI * 440 * index / sampleRate) * 0.08;
    wav.writeInt16LE(Math.round(sample * 32_767), 44 + index * 2);
  }
  return wav;
}

test("seleciona, remove e processa arquivos localmente", async ({ page }) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (["POST", "PUT", "PATCH"].includes(request.method())) {
      writes.push(`${request.method()} ${request.url()}`);
    }
  });

  await page.goto("/importar");
  await expect(
    page.getByRole("heading", { name: "Importar", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Importar", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  const input = page.getByLabel("Selecionar arquivos do dispositivo");
  await input.setInputFiles([
    {
      name: "algoritmos.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("pdf de teste"),
    },
    {
      name: "anotacoes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("texto de teste"),
    },
    {
      name: "aula.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("vídeo de teste"),
    },
  ]);

  await expect(page.getByRole("listitem")).toHaveCount(3);
  await expect(page.getByText("Não iniciado", { exact: true })).toHaveCount(
    3,
  );
  await expect(
    page.getByRole("progressbar", { name: "Progresso geral da importação" }),
  ).toHaveAttribute("aria-valuenow", "0");
  await page.screenshot({
    path: "test-results/import-selected.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "Remover algoritmos.pdf" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("algoritmos.pdf")).toHaveCount(0);

  await input.setInputFiles({
    name: "arquivo.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("arquivo de teste"),
  });
  await expect(page.locator('p[role="alert"]')).toContainText(
    "arquivo não compatível foi ignorado",
  );
  await expect(page.getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByText("Extraído", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Erro", { exact: true })).toHaveCount(1);
  await expect(
    page.getByRole("progressbar", { name: "Progresso geral da importação" }),
  ).toHaveAttribute("aria-valuenow", "100");
  await expect(
    page.getByRole("button", { name: "Importar", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/import-complete.png",
    fullPage: true,
  });
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);

  const extraction = await readIndexedDBStore<ExtractedContent>(page, "contents");
  expect(extraction).toHaveLength(2);
  expect(extraction.find(
    (record: { fileType: string }) => record.fileType === "txt",
  )).toMatchObject({ status: "extracted", extractedText: "texto de teste" });

  const embeddings = await readIndexedDBStore(page, "embeddings");
  const embeddingMetadata = await readIndexedDBStore<{ key: string; value: { status: string } }>(page, "metadata");
  expect(embeddingMetadata.find((item) => item.key === "embedding-index")?.value.status).toBe("ready");
  expect(embeddings).toHaveLength(1);

  await page.goto("/");
  await page.getByRole("button", { name: "Detalhes da ingestão" }).click();
  const diagnostics = page.getByRole("dialog", { name: "Detalhes da ingestão" });
  await expect(diagnostics.getByLabel("Extraídos: 1")).toBeVisible();
  await expect(diagnostics.getByLabel("Erros: 1")).toBeVisible();
  await expect(diagnostics.getByLabel("Embeddings: 1")).toBeVisible();
});

test("reimporta arquivo ausente localmente sem duplicar o material restaurado", async ({ page }) => {
  const name = "material-restaurado.txt";
  const content = "Conteúdo real para recuperação do arquivo.";
  const lastModified = 1_700_000_000_000;
  const input = page.getByLabel("Selecionar arquivos do dispositivo");
  const selectFile = async () => input.evaluate((node, details) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([details.content], details.name, { type: "text/plain", lastModified: details.lastModified }));
    (node as HTMLInputElement).files = transfer.files;
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, { name, content, lastModified });
  await page.goto("/importar");
  await selectFile();
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Extração concluída" })).toBeVisible();
  const originalMaterials = await readIndexedDBStore<Array<{ id: string; name: string }>[number]>(page, "documents");
  const original = originalMaterials.find((material) => material.name === name);
  expect(original).toBeDefined();

  await page.evaluate(async (id) => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle("studyai-materials");
    await directory.removeEntry(id);
  }, original!.id);
  await page.goto("/importar");
  await selectFile();
  await expect(page.locator("p[role='alert']")).toContainText("material sem cópia local será restaurado");
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Extração concluída" })).toBeVisible();

  const restoredMaterials = await readIndexedDBStore<Array<{ id: string; name: string }>[number]>(page, "documents");
  expect(restoredMaterials.filter((material) => material.name === name)).toHaveLength(1);
  expect(restoredMaterials.find((material) => material.name === name)?.id).toBe(original!.id);
  const recoveredContent = await page.evaluate(async (id) => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle("studyai-materials");
    return (await (await directory.getFileHandle(id)).getFile()).text();
  }, original!.id);
  expect(recoveredContent).toBe(content);
});

test("aceita arquivo por arrastar e soltar e evita duplicatas", async ({
  page,
}) => {
  await page.goto("/importar");
  const dropZone = page.getByRole("region", {
    name: "Arraste seus materiais para cá",
  });
  const dropFile = () =>
    dropZone.evaluate((element) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(["documento de teste"], "aula.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          lastModified: 1,
        }),
      );
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: transfer });
      element.dispatchEvent(event);
    });
  await dropFile();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByText("aula.docx", { exact: true })).toBeVisible();
  await dropFile();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.locator('p[role="alert"]')).toContainText(
    "arquivo repetido não foi adicionado",
  );
});

test("aceita imagens e formatos adicionais de áudio", async ({ page }) => {
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles([
    { name: "quadro.jpg", mimeType: "image/jpeg", buffer: Buffer.from("imagem") },
    { name: "captura.webp", mimeType: "image/webp", buffer: Buffer.from("imagem") },
    { name: "gravacao.wav", mimeType: "audio/wav", buffer: Buffer.from("audio") },
    { name: "aula.m4a", mimeType: "audio/mp4", buffer: Buffer.from("audio") },
  ]);

  await expect(page.getByRole("listitem")).toHaveCount(4);
  await expect(page.getByText("JPG", { exact: true })).toBeVisible();
  await expect(page.getByText("WEBP", { exact: true })).toBeVisible();
  await expect(page.getByText("WAV", { exact: true })).toBeVisible();
  await expect(page.getByText("M4A", { exact: true })).toBeVisible();
  await expect(page.locator('p[role="alert"]')).toHaveCount(0);
});

test("executa OCR local em uma imagem e indexa o texto reconhecido", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 700, height: 180 });
  await page.setContent(
    '<style>body{margin:0}</style><main style="display:flex;align-items:center;width:700px;height:180px;' +
    'background:white;color:black;font:72px Arial">ALGORITMOS</main>',
    );
  const image = await page.screenshot({ type: "png" });
  const scannedImage = await page.screenshot({ type: "jpeg", quality: 95 });
  const scannedPdf = createScannedPdf(scannedImage, 700, 180);
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles([
    { name: "quadro.png", mimeType: "image/png", buffer: image },
    { name: "digitalizado.pdf", mimeType: "application/pdf", buffer: scannedPdf },
  ]);

  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(
    page.getByText(/^(Extraído|Erro)$/),
  ).toHaveCount(2, { timeout: 150_000 });

  const extractionErrors = (await readIndexedDBStore<Array<{ status: string; error?: string }>[number]>(page, "contents"))
    .filter((record) => record.status === "error").map((record) => record.error);
  if (extractionErrors?.length) {
    throw new Error(`Falha no OCR: ${extractionErrors.join("; ")}`);
  }

  const result = {
    extraction: await readIndexedDBStore<ExtractedContent>(page, "contents"),
    chunks: await readIndexedDBStore(page, "chunks"),
    embeddings: await readIndexedDBStore(page, "embeddings"),
  };
  const imageRecord = result.extraction.find(
    (record: { fileType: string }) => record.fileType === "png",
  )!;
  const pdfRecord = result.extraction.find(
    (record: { fileType: string }) => record.fileType === "pdf",
  )!;
  expect(imageRecord).toMatchObject({
    fileType: "png",
    status: "extracted",
    metadata: { ocrPerformed: true, width: 700, height: 180 },
  });
  expect(imageRecord.extractedText.toUpperCase()).toContain("ALGORITMOS");
  expect(pdfRecord).toMatchObject({
    fileType: "pdf",
    status: "extracted",
    metadata: { ocrPerformed: true, pageCount: 1 },
  });
  expect(pdfRecord.extractedText.toUpperCase()).toContain("ALGORITMOS");
  expect(result.chunks).toHaveLength(2);
  expect(result.embeddings).toHaveLength(2);
  const generatedStudies = await readIndexedDBStore<Array<{ analysisStatus?: string; wordCount?: number }>[number]>(page, "studies");
  expect(generatedStudies).toHaveLength(2);
  expect(generatedStudies.every((study) => study.analysisStatus === "analyzed" && (study.wordCount ?? 0) > 0)).toBe(true);

  await page.goto("/");
  await page.getByRole("button", { name: "Detalhes da ingestão" }).click();
  const diagnostics = page.getByRole("dialog", { name: "Detalhes da ingestão" });
  await expect(diagnostics.getByText("OCR", { exact: true }).locator("..")).toContainText("2");
  await expect(diagnostics.getByText("Tempo total de processamento").locator("..")).not.toContainText("0 ms");
});

test("processa áudio no runtime local de transcrição", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles({
    name: "gravacao.wav",
    mimeType: "audio/wav",
    buffer: createWavFixture(),
  });

  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByText(/^(Extraído|Erro)$/)).toBeVisible({ timeout: 240_000 });
  const record = (await readIndexedDBStore<ExtractedContent>(page, "contents"))[0];
  if (record?.status === "error") {
    expect(record.error).toBeTruthy();
    expect(record.fileType).toBe("wav");
    return;
  }
  expect(record).toMatchObject({
    fileType: "wav",
    status: "extracted",
    metadata: {
      transcriptionPerformed: true,
      transcriptionModel: "onnx-community/whisper-tiny",
    },
  });
  expect(record.metadata.duration).toBeGreaterThan(0);
  expect(record.metadata.processingTimeMs).toBeGreaterThan(0);

  await page.goto("/");
  await page.getByRole("button", { name: "Detalhes da ingestão" }).click();
  const diagnostics = page.getByRole("dialog", { name: "Detalhes da ingestão" });
  await expect(diagnostics.getByText("Transcrições", { exact: true }).locator("..")).toContainText("1");
});

test("extrai texto e metadados de PDF, DOCX e PPTX", async ({ page }) => {
  const docx = await createOoxmlFixture(
    "word/document.xml",
    "Conteúdo do documento sobre algoritmos",
  );
  const pptx = await createOoxmlFixture(
    "ppt/slides/slide1.xml",
    "Conteúdo do primeiro slide",
  );
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles([
    { name: "aula.pdf", mimeType: "application/pdf", buffer: TEXT_PDF },
    {
      name: "material.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: docx,
    },
    {
      name: "slides.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: pptx,
    },
  ]);

  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByText("Extraído", { exact: true })).toHaveCount(3, {
    timeout: 10_000,
  });

  const records = await readIndexedDBStore<ExtractedContent>(page, "contents");
  expect(records).toHaveLength(3);
  expect(records.find((record: { fileType: string }) => record.fileType === "pdf"))
    .toMatchObject({ status: "extracted", metadata: { pageCount: 1 } });
  expect(records.find((record: { fileType: string }) => record.fileType === "pdf")!
    .metadata.ocrPerformed).toBeUndefined();
  expect(records.find((record: { fileType: string }) => record.fileType === "docx"))
    .toMatchObject({
      status: "extracted",
      extractedText: "Conteúdo do documento sobre algoritmos",
    });
  const presentation = records.find((record: { fileType: string }) => record.fileType === "pptx")!;
  expect(presentation).toMatchObject({ status: "extracted", metadata: { pageCount: 1 } });
  expect(presentation.extractedText).toContain("Conteúdo do primeiro slide");

  const chunkStore = await readIndexedDBStore<Array<{ chunkIndex: number }>[number]>(page, "chunks");
  expect(chunkStore).toHaveLength(3);
  expect(chunkStore.map((chunk) => chunk.chunkIndex))
    .toEqual([0, 0, 0]);

  const embeddingStore = await readIndexedDBStore<Array<{ embedding: string }>[number]>(page, "embeddings");
  expect(embeddingStore).toHaveLength(3);
  expect(typeof embeddingStore[0].embedding).toBe("string");
  expect(embeddingStore[0].embedding.length).toBeGreaterThan(0);
});

test("gera estudos automáticos para PDF Estácio, PDF comum, DOCX e PPTX", async ({ page }) => {
  const estacioPdf = createTextPdf([
    "ALGORITMOS E ESTRUTURAS DE DADOS.",
    "OBJETIVOS: Compreender vetores e listas.",
    "INTRODUCAO: Organizacao de dados.",
    "UNIDADE 1: Estruturas lineares.",
    "CAPITULO 1: Vetores.",
    "SECAO 1: Indices e acesso.",
    "ATIVIDADES: Pratica orientada.",
    "EXERCICIOS: Questoes de revisao.",
    "CONCLUSAO: Sintese da unidade.",
    "REFERENCIAS: Bibliografia basica.",
  ]);
  const docx = await createOoxmlFixture(
    "word/document.xml",
    "BANCO DE DADOS. UNIDADE 1: Modelo relacional. CAPITULO 1: Tabelas e consultas SQL.",
  );
  const pptx = await createOoxmlFixture(
    "ppt/slides/slide1.xml",
    "PROGRAMACAO. UNIDADE 1: Funcoes. SECAO 1: Parametros e retorno de codigo.",
  );
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles([
    { name: "estacio-algoritmos.pdf", mimeType: "application/pdf", buffer: estacioPdf },
    { name: "documento-comum.pdf", mimeType: "application/pdf", buffer: TEXT_PDF },
    { name: "banco-de-dados.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docx },
    { name: "programacao.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: pptx },
  ]);
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByText("Extraído", { exact: true })).toHaveCount(4);

  const contents = await readIndexedDBStore<ExtractedContent>(page, "contents");
  const studies = await readIndexedDBStore<Array<{
    title: string;
    subject: string;
    chapters?: Array<{ marker: string; title: string }>;
    analysisStatus?: string;
    readingTimeMinutes?: number;
  }>[number]>(page, "studies");
  expect(studies).toHaveLength(4);
  expect(studies.every((study) => study.analysisStatus === "analyzed")).toBe(true);
  expect(contents.every((content) => content.stages?.find((stage) => stage.id === "study")?.status === "completed")).toBe(true);

  const estacio = contents.find((content) => content.metadata.name === "estacio-algoritmos.pdf")!;
  expect(estacio.metadata).toMatchObject({
    subject: "Algoritmos e Estruturas de Dados",
    topic: "Estruturas lineares",
    analysisStatus: "analyzed",
  });
  expect(estacio.metadata.chapters?.map((chapter) => chapter.marker)).toEqual(expect.arrayContaining([
    "objectives", "introduction", "unit", "chapter", "section", "activities", "exercises", "conclusion", "references",
  ]));
  expect(studies.find((study) => study.title === "Estruturas lineares")?.chapters?.length).toBeGreaterThanOrEqual(9);

  expect(contents.find((content) => content.metadata.name === "documento-comum.pdf")?.metadata)
    .toMatchObject({ topic: "documento comum", analysisStatus: "analyzed" });
  expect(contents.find((content) => content.fileType === "docx")?.metadata)
    .toMatchObject({ subject: "Banco de Dados", topic: "Modelo relacional" });
  expect(contents.find((content) => content.fileType === "pptx")?.metadata)
    .toMatchObject({ subject: "Programação", topic: "Funcoes" });
});

test("normaliza, analisa e registra todas as etapas antes de indexar", async ({ page }) => {
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles({
    name: "algoritmos-e-vetores.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "ALGORITMOS E VETORES\r\n\r\nVetores armazenam   elementos em posições numeradas.\r\n" +
      "Eles permitem acesso rápido aos dados e são usados em algoritmos.",
      "utf8",
    ),
  });
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByText("Extraído", { exact: true })).toBeVisible();

  const record = (await readIndexedDBStore<ExtractedContent>(page, "contents"))[0];
  expect(record.extractedText).not.toContain("   ");
  expect(record.metadata).toMatchObject({
    encoding: "UTF-8",
    subject: "Algoritmos e Estruturas de Dados",
    language: "pt-BR",
  });
  expect(record.metadata.wordCount).toBeGreaterThan(10);
  expect(record.metadata.readingTimeMinutes).toBe(1);
  expect(record.metadata.keywords!.length).toBeGreaterThan(0);
  expect(record.metadata.summaryPreview).toContain("Vetores armazenam elementos");
  expect(record.stages!.find((stage: { id: string }) => stage.id === "normalization")!.status).toBe("completed");
  expect(record.stages!.find((stage: { id: string }) => stage.id === "analysis")!.status).toBe("completed");
  expect(record.stages!.find((stage: { id: string }) => stage.id === "indexed")!.status).toBe("completed");
  expect(record.logs!.length).toBeGreaterThanOrEqual(7);

  await page.goto("/biblioteca");
  await expect(page.getByRole("article", { name: "algoritmos-e-vetores.txt" }))
    .toContainText("Algoritmos e Estruturas de Dados");
  await expect(page.getByText("Analisado", { exact: true })).toBeVisible();
  await expect(page.getByText("pt-BR", { exact: true })).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "Detalhes da ingestão" }).click();
  const pipeline = page.getByRole("region", { name: "Pipeline de ingestão" });
  await expect(pipeline.getByText("algoritmos-e-vetores.txt", { exact: true })).toBeVisible();
  await expect(pipeline.getByText("Normalização", { exact: true })).toBeVisible();
  await expect(pipeline.getByText("Indexado", { exact: true })).toBeVisible();
});

test("detecta TXT UTF-16 e Latin1", async ({ page }) => {
  const utf16Text = Buffer.from("T\u0000e\u0000x\u0000t\u0000o\u0000 \u0000U\u0000T\u0000F\u00001\u00006\u0000", "binary");
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), utf16Text]);
  const latin1 = Buffer.from("Introdução à programação e memória", "latin1");
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles([
    { name: "utf16.txt", mimeType: "text/plain", buffer: utf16 },
    { name: "latin1.txt", mimeType: "text/plain", buffer: latin1 },
  ]);
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByText("Extraído", { exact: true })).toHaveCount(2);
  const records = await readIndexedDBStore<ExtractedContent>(page, "contents");
  expect(records.find((record) => record.metadata.name === "utf16.txt")!.metadata.encoding)
    .toBe("UTF-16LE");
  expect(records.find((record) => record.metadata.name === "latin1.txt")!.metadata.encoding)
    .toBe("windows-1252");
});

test("MP3 e MP4 inválidos geram diagnóstico estruturado por arquivo", async ({ page }) => {
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles([
    { name: "audio-corrompido.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("invalid-mp3") },
    { name: "video-corrompido.mp4", mimeType: "video/mp4", buffer: Buffer.from("invalid-mp4") },
  ]);
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(page.getByText("Erro", { exact: true })).toHaveCount(2, { timeout: 30_000 });
  const records = await readIndexedDBStore<ExtractedContent>(page, "contents");
  expect(records).toHaveLength(2);
  for (const record of records) {
    expect(record.status).toBe("error");
    expect(record.errorDetails).toMatchObject({
      fileName: record.metadata.name,
      stage: "extraction",
    });
    expect(record.errorDetails!.reason).toBeTruthy();
    expect(record.errorDetails!.suggestedAction).toBeTruthy();
  }
});

test("lista de arquivos permanece responsiva no celular", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/importar");
  await page.getByLabel("Selecionar arquivos do dispositivo").setInputFiles([
    {
      name: "conteudo-da-aula.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("pdf de teste"),
    },
    {
      name: "apresentacao.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: Buffer.from("slides de teste"),
    },
  ]);
  await expect(page.getByRole("listitem")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Importar", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/import-mobile-files.png",
    fullPage: true,
  });
});
