import { pageNeedsTutorReview } from "@/features/ocr/exercise-review";
import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import type { RetrievedChunk } from "@/features/retrieval/RetrievalTypes";
import type { Material } from "@/types/material";

export type DisciplineSelection = { key: string; subject: string; materialIds: string[] };

export function disciplineKey(material: Material) {
  const subject = material.subject?.trim();
  if (!subject || /^(materiais importados|disciplina desconhecida)$/i.test(subject)) return "";
  return JSON.stringify([material.course?.trim() ?? "", material.semester?.trim() ?? "", subject]);
}

export function disciplineMaterials(materials: Material[], selection: DisciplineSelection) {
  return materials.filter((material) => disciplineKey(material) === selection.key && selection.materialIds.includes(material.id));
}

export function materialKind(material: Material) {
  const label = `${material.name} ${material.tags?.join(" ") ?? ""}`;
  if (/simulado|prova/i.test(label)) return "Simulado";
  if (material.academyMaterialKind === "exercise" || /exerc[ií]cio/i.test(label)) return "Exercícios";
  return "Material de estudo";
}

function words(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[a-z0-9]{3,}|\b\d+\b/g) ?? [];
}

export function retrieveDiscipline(question: string, selection: DisciplineSelection, materials: Material[], records: ExtractedContent[]) {
  const scoped = disciplineMaterials(materials, selection);
  const direct = rankDiscipline(question, selection, scoped, records);
  const anchor = direct[0];
  if (!anchor || direct.some((chunk) => chunk.fileId !== anchor.fileId)) return direct;
  const topic = scoped.find((material) => material.fileId === anchor.fileId)?.topic;
  if (!topic) return direct;
  const related = rankDiscipline(topic, selection, scoped.filter((material) => material.fileId !== anchor.fileId), records)
    .filter((chunk) => chunk.matchedTerms.length > 0);
  return [anchor, ...related, ...direct.slice(1)].slice(0, 3);
}

function rankDiscipline(question: string, selection: DisciplineSelection, materials: Material[], records: ExtractedContent[]) {
  const terms = new Set(words(question).filter((term) => !["qual", "como", "para", "uma", "desde", "zero", "sobre", "dos", "das", "com", "ensine", "explique"].includes(term)));
  const byFile = new Map(records.filter((record) => record.status === "extracted").map((record) => [record.fileId, record]));
  const candidates: RetrievedChunk[] = [];
  for (const material of materials) {
    const record = byFile.get(material.fileId);
    if (!record) continue;
    const pages = record.pages?.length
      ? record.pages.filter((page) => !pageNeedsTutorReview(page))
      : record.metadata.ocrPerformed ? [] : [{ text: record.extractedText, page: undefined }];
    const titleTerms = new Set(words(`${material.name} ${material.topic ?? ""}`));
    let chunkIndex = 0;
    for (const page of pages) {
      for (let offset = 0; offset < page.text.length; offset += 760) {
        const text = page.text.slice(offset, offset + 900).trim();
        const index = chunkIndex++;
        if (!text) continue;
        const textTerms = new Set(words(text));
        const matchedTerms = [...terms].filter((term) => textTerms.has(term));
        const score = matchedTerms.length * 2 + [...terms].filter((term) => titleTerms.has(term)).length;
        if (!score) continue;
        candidates.push({
          id: `${record.id}:${page.page ?? "text"}:${offset}`,
          studyId: record.studyId, fileId: material.fileId, chunkIndex: index, text, score, matchedTerms,
          metadata: {
            extractedContentId: record.id, sourceName: material.name.slice(0, 200), subject: selection.subject,
            fileType: record.fileType, mimeType: material.mimeType, size: material.size,
            pageStart: record.fileType === "pdf" ? page.page : undefined,
          },
        });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const bestByFile = new Map<string, RetrievedChunk>();
  for (const chunk of candidates) {
    if (!bestByFile.has(chunk.fileId)) bestByFile.set(chunk.fileId, chunk);
  }
  return [...bestByFile.values(), ...candidates.filter((chunk) => bestByFile.get(chunk.fileId) !== chunk)].slice(0, 3);
}
