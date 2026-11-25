import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";

test("falha de indexação não apresenta material parcial como publicado", async () => {
  const source = readFileSync("src/features/academy/studio/export/service.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const materials = new Map<string, unknown>();
  let indexAttempted = false;
  const deps: Record<string, unknown> = {
    "@/features/account/SessionOperationManager": { SessionOperationManager: { start: () => ({ assertCurrent: () => {}, release: () => {} }) } },
    "@/services/material-runtime-store": { MaterialRuntimeStore: { remove: () => {} } },
    "@/lib/storage/StorageManager": { StorageManager: { transaction: async (_: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({ get: async () => undefined, getAll: async () => [], delete: async () => {}, put: async (store: string) => { if (store === "contents") { indexAttempted = true; throw new Error("falha sintética de indexação"); } } }) } },
    "@/features/extraction/ContentStorage": { ContentStorage: { upsert: async () => { throw new Error("falha sintética de indexação"); } } },
    "@/features/retrieval/ChunkService": { ChunkService: { createChunks: () => [] } },
    "@/features/retrieval/ChunkStorage": { ChunkStorage: { replaceForContent: async () => {} } },
    "@/services/material-binary-storage": { MaterialBinaryStorage: { save: async () => true } },
    "@/services/material-service": { MaterialService: { upsert: async (value: { id: string }) => { materials.set(value.id, value); } } },
    "./model": { buildDocumentModel: () => ({ sections: [] }), buildDeckModel: () => ({ slides: [] }), modelToMarkdown: () => "conteúdo" },
    "./pdf": { StudioPdfExporter: { generate: async () => ({ blob: new Blob(["pdf"]), fileName: "arquivo.pdf" }) } },
  };
  const compiled = { exports: {} as Record<string, unknown> };
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, require: (id: string) => { if (!(id in deps)) throw new Error(`Dependência inesperada: ${id}`); return deps[id]; }, Blob, File, Date, Math, crypto: webcrypto });
  const service = compiled.exports.StudioExportService as { export(doc: unknown, kind: string, options: unknown): Promise<unknown> };
  let failed = false;
  try { await service.export({ id: "doc-1", studyId: "study-1", title: "Documento", version: 1, customization: {}, documentStructure: { sections: [], metadata: { keywords: [] } } }, "pdf", { includeAnswers: true, download: false }); } catch { failed = true; }
  expect(failed).toBe(true);
  expect(indexAttempted).toBe(true);
  expect(materials.size).toBe(0);
});

test("falha na republicação preserva o arquivo anteriormente publicado", async () => {
  const source = readFileSync("src/features/academy/studio/export/service.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const binaries = new Map([["studio-export-doc-1-pdf", "versão anterior"]]);
  let indexAttempted = false;
  const deps: Record<string, unknown> = {
    "@/features/account/SessionOperationManager": { SessionOperationManager: { start: () => ({ assertCurrent: () => {}, release: () => {} }) } },
    "@/services/material-runtime-store": { MaterialRuntimeStore: { remove: () => {} } },
    "@/lib/storage/StorageManager": { StorageManager: { transaction: async (_: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({ get: async () => undefined, getAll: async () => [], delete: async () => {}, put: async (store: string) => { if (store === "contents") { indexAttempted = true; throw new Error("falha sintética de indexação"); } } }) } },
    "@/features/extraction/ContentStorage": { ContentStorage: { upsert: async () => { throw new Error("falha sintética"); } } },
    "@/features/retrieval/ChunkService": { ChunkService: { createChunks: () => [] } },
    "@/features/retrieval/ChunkStorage": { ChunkStorage: { replaceForContent: async () => {} } },
    "@/services/material-binary-storage": { MaterialBinaryStorage: { save: async (id: string) => { binaries.set(id, "versão nova"); return true; } } },
    "@/services/material-service": { MaterialService: { upsert: async () => {} } },
    "./model": { buildDocumentModel: () => ({ sections: [] }), buildDeckModel: () => ({ slides: [] }), modelToMarkdown: () => "conteúdo" },
    "./pdf": { StudioPdfExporter: { generate: async () => ({ blob: new Blob(["novo"]), fileName: "arquivo.pdf" }) } },
  };
  const compiled = { exports: {} as Record<string, unknown> };
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, require: (id: string) => { if (!(id in deps)) throw new Error(`Dependência inesperada: ${id}`); return deps[id]; }, Blob, File, Date, Math, crypto: webcrypto });
  const service = compiled.exports.StudioExportService as { export(doc: unknown, kind: string, options: unknown): Promise<unknown> };
  let failed = false;
  try { await service.export({ id: "doc-1", studyId: "study-1", title: "Documento", version: 2, customization: {}, documentStructure: { sections: [], metadata: { keywords: [] } } }, "pdf", { includeAnswers: true, download: false }); } catch { failed = true; }
  expect(failed).toBe(true);
  expect(indexAttempted).toBe(true);
  expect(binaries.size).toBe(2);
  expect(binaries.get("studio-export-doc-1-pdf")).toBe("versão anterior");
});

test("falha nos trechos não troca o conteúdo indexado da publicação anterior", async () => {
  const source = readFileSync("src/features/academy/studio/export/service.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let activeText = "conteúdo anterior";
  let chunkAttempted = false;
  const deps: Record<string, unknown> = {
    "@/features/account/SessionOperationManager": { SessionOperationManager: { start: () => ({ assertCurrent: () => {}, release: () => {} }) } },
    "@/services/material-runtime-store": { MaterialRuntimeStore: { remove: () => {} } },
    "@/lib/storage/StorageManager": { StorageManager: { transaction: async (_: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      let pendingText = activeText;
      await fn({ get: async () => undefined, getAll: async () => [], delete: async () => {}, put: async (store: string, value: { extractedText?: string }) => {
        if (store === "contents") pendingText = value.extractedText ?? pendingText;
        if (store === "chunks") { chunkAttempted = true; throw new Error("falha sintética"); }
      } });
      activeText = pendingText;
    } } },
    "@/features/extraction/ContentStorage": { ContentStorage: { upsert: async (content: { extractedText: string }) => { activeText = content.extractedText; } } },
    "@/features/retrieval/ChunkService": { ChunkService: { createChunks: () => [{ id: "chunk-1", metadata: { extractedContentId: "x" } }] } },
    "@/features/retrieval/ChunkStorage": { ChunkStorage: { replaceForContent: async () => { chunkAttempted = true; throw new Error("falha sintética"); } } },
    "@/services/material-binary-storage": { MaterialBinaryStorage: { save: async () => true } },
    "@/services/material-service": { MaterialService: { upsert: async () => {} } },
    "./model": { buildDocumentModel: () => ({ sections: [] }), buildDeckModel: () => ({ slides: [] }), modelToMarkdown: () => "conteúdo novo" },
    "./pdf": { StudioPdfExporter: { generate: async () => ({ blob: new Blob(["novo"]), fileName: "arquivo.pdf" }) } },
  };
  const compiled = { exports: {} as Record<string, unknown> };
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, require: (id: string) => { if (!(id in deps)) throw new Error(`Dependência inesperada: ${id}`); return deps[id]; }, Blob, File, Date, Math, crypto: webcrypto });
  const service = compiled.exports.StudioExportService as { export(doc: unknown, kind: string, options: unknown): Promise<unknown> };
  let failed = false;
  try { await service.export({ id: "doc-1", studyId: "study-1", title: "Documento", version: 2, customization: {}, documentStructure: { sections: [], metadata: { keywords: [] } } }, "pdf", { includeAnswers: true, download: false }); } catch { failed = true; }
  expect(failed).toBe(true);
  expect(chunkAttempted).toBe(true);
  expect(activeText).toBe("conteúdo anterior");
});
