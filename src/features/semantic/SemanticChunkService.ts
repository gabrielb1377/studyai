import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import { semanticId, uniqueStrings } from "./semantic-utils";
import type { KnowledgeConcept, KnowledgeRelation, SemanticBlock, SemanticChunk } from "./types";

const TARGET_CHARACTERS = 1_200;

function relationIdsFor(conceptIds: readonly string[], relations: readonly KnowledgeRelation[]) {
  const ids = new Set(conceptIds);
  return relations.filter((relation) => ids.has(relation.sourceId) || ids.has(relation.targetId)).map((relation) => relation.id);
}

export const SemanticChunkService = {
  create(content: ExtractedContent, blocks: readonly SemanticBlock[], concepts: readonly KnowledgeConcept[], relations: readonly KnowledgeRelation[]): SemanticChunk[] {
    if (content.status !== "extracted" || !content.extractedText.trim()) return [];
    const groups: SemanticBlock[][] = [];
    let current: SemanticBlock[] = [];
    let size = 0;
    const flush = () => {
      if (current.length) groups.push(current);
      current = [];
      size = 0;
    };

    for (const block of blocks) {
      const structural = block.kind === "heading" || block.kind === "definition" || block.kind === "list" || block.kind === "table" || block.kind === "formula" || block.kind === "example";
      if (current.length && (size + block.text.length > TARGET_CHARACTERS || (block.kind === "heading" && size > 350))) flush();
      current.push(block);
      size += block.text.length;
      if (structural && size >= TARGET_CHARACTERS * 0.75) flush();
    }
    flush();

    return groups.map((group, chunkIndex) => {
      const conceptIds = uniqueStrings(group.flatMap((block) => block.conceptIds));
      const namedConcepts = concepts.filter((concept) => conceptIds.includes(concept.id));
      const header = namedConcepts.length > 0 ? `Conceitos: ${namedConcepts.map((concept) => concept.name).join(", ")}` : "";
      const text = [header, ...group.map((block) => block.text)].filter(Boolean).join("\n\n");
      return {
        id: semanticId("semantic-chunk", content.id, String(chunkIndex), text.slice(0, 180)),
        studyId: content.studyId,
        fileId: content.fileId,
        chunkIndex,
        text,
        metadata: {
          extractedContentId: content.id,
          sourceName: content.metadata.name,
          fileType: content.fileType,
          mimeType: content.metadata.type,
          size: content.metadata.size,
          pageCount: content.metadata.pageCount,
          duration: content.metadata.duration,
          language: content.metadata.language,
          title: content.metadata.title,
          subject: content.metadata.subject,
          topic: content.metadata.topic,
          keywords: content.metadata.keywords,
          semanticType: "semantic",
          conceptIds,
          relationIds: relationIdsFor(conceptIds, relations),
          chapter: group.find((block) => block.chapter)?.chapter,
          section: group.find((block) => block.section)?.section,
        },
      } satisfies SemanticChunk;
    });
  },
};
