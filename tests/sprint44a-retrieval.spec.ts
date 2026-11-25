import { expect, test } from "@playwright/test";
import { disciplineKey, retrieveDiscipline } from "../src/features/tutor/services/DisciplineContext";
import type { ExtractedContent, ExtractedPage } from "../src/features/extraction/ExtractionTypes";
import type { Material } from "../src/types/material";

test("limita trechos e exclui OCR não confirmado, material removido e outra turma", () => {
  const materials = ["unidade", "exercicio", "simulado", "outra-turma"].map((id) => ({
    id, fileId: id, name: id, subject: "Modelagem", semester: id === "outra-turma" ? "2" : "1",
    mimeType: "application/pdf", size: 8000, topic: id === "unidade" ? "Bisseção" : undefined,
  } as Material));
  const selection = { key: disciplineKey(materials[0]), subject: "Modelagem", materialIds: [...materials.map(({ id }) => id), "removido"] };
  const records = selection.materialIds.map((id) => ({
    id, fileId: id, studyId: "estudo", status: "extracted", fileType: "pdf",
    metadata: { ocrPerformed: true },
    pages: [{
      method: "ocr", status: "ready", edited: id !== "simulado", page: 7,
      text: "Bisseção usa zeros de função para reduzir o intervalo. ".repeat(300),
    } as ExtractedPage],
  } as ExtractedContent));
  const chunks = retrieveDiscipline("bisseção intervalo", selection, materials, records);
  expect(chunks).toHaveLength(3);
  expect(new Set(chunks.map(({ fileId }) => fileId))).toEqual(new Set(["unidade", "exercicio"]));
  expect(chunks.every(({ text, metadata }) => text.length <= 900 && metadata.pageStart === 7)).toBe(true);
  expect(retrieveDiscipline("fotossíntese", selection, materials, records)).toEqual([]);
  expect(retrieveDiscipline("Ensine a unidade", selection, materials, records).map(({ fileId }) => fileId)).toContain("exercicio");
});
